import { beforeEach, describe, expect, it, vi } from "vitest";

type MockOutboxOperation = {
  id: string;
  operationId: string;
  entityId: string;
  operationType: "create" | "update" | "delete";
  entityType: "product" | "stockMovement";
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  createdAt: string;
  processedAt: string | null;
  error: string | null;
};

type MockStockMovement = {
  id: string;
  tenantId: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  idempotencyKey: string;
  clientCreatedAt: string;
  serverCreatedAt: string | null;
  syncedAt: string | null;
  syncStatus: "pending" | "processing" | "synced" | "failed";
};

type MockProduct = {
  id: string;
  tenantId: string;
  name: string;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const state = vi.hoisted(() => {
  const outbox = new Map<string, MockOutboxOperation>();
  const stockMovements = new Map<string, MockStockMovement>();
  const products = new Map<string, MockProduct>();
  let isOnline = true;

  return {
    outbox,
    stockMovements,
    products,
    isOnline,
    setOnline(value: boolean) {
      isOnline = value;
    },
    reset() {
      outbox.clear();
      stockMovements.clear();
      products.clear();
      isOnline = true;
    },
  };
});

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

vi.stubGlobal("navigator", {
  get onLine() {
    return state.isOnline;
  },
});

const eventListeners = new Map<string, Set<() => void>>();
vi.stubGlobal("window", {
  addEventListener: (event: string, callback: () => void) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(callback);
  },
  removeEventListener: (event: string, callback: () => void) => {
    eventListeners.get(event)?.delete(callback);
  },
  setInterval: vi.fn(() => 123),
  clearInterval: vi.fn(),
  navigator: {
    get onLine() {
      return state.isOnline;
    },
  },
});

vi.mock("~/features/offline/database", () => ({
  db: {
    outbox: {
      toArray: async () => Array.from(state.outbox.values()),
      update: async (id: string, patch: Partial<MockOutboxOperation>) => {
        const existing = state.outbox.get(id);
        if (existing) {
          state.outbox.set(id, { ...existing, ...patch });
        }
      },
    },
    stockMovements: {
      update: async (id: string, patch: Partial<MockStockMovement>) => {
        const existing = state.stockMovements.get(id);
        if (existing) {
          state.stockMovements.set(id, { ...existing, ...patch });
        }
      },
    },
    products: {
      update: async (id: string, patch: Partial<MockProduct>) => {
        const existing = state.products.get(id);
        if (existing) {
          state.products.set(id, { ...existing, ...patch });
        }
      },
    },
  },
}));

vi.mock("~/features/offline/outbox", () => ({
  markOperationCompleted: async (operationId: string) => {
    const op = state.outbox.get(operationId);
    if (op) {
      state.outbox.set(operationId, {
        ...op,
        status: "completed",
        processedAt: new Date().toISOString(),
      });
    }
  },
  markOperationFailed: async (operationId: string, error: string) => {
    const op = state.outbox.get(operationId);
    if (op) {
      state.outbox.set(operationId, {
        ...op,
        status: "failed",
        error,
        retryCount: op.retryCount + 1,
      });
    }
  },
  markOperationProcessing: async (operationId: string) => {
    const op = state.outbox.get(operationId);
    if (op) {
      state.outbox.set(operationId, { ...op, status: "processing" });
    }
  },
}));

vi.mock("~/features/offline/product-operations", () => ({
  updateProductSyncStatus: async (productId: string, status: "pending" | "synced" | "failed") => {
    const product = state.products.get(productId);
    if (product) {
      state.products.set(productId, { ...product, syncStatus: status });
    }
  },
  applyServerProductState: async () => {
    return;
  },
}));

vi.mock("~/features/offline/movement-operations", () => ({
  markMovementSynced: async (input: { movementId: string; operationId: string }) => {
    const movement = state.stockMovements.get(input.movementId);
    if (movement) {
      state.stockMovements.set(input.movementId, {
        ...movement,
        syncStatus: "synced",
        syncedAt: new Date().toISOString(),
      });
    }
  },
  markMovementSyncFailed: async (input: { movementId: string; operationId: string; error: string }) => {
    const movement = state.stockMovements.get(input.movementId);
    if (movement) {
      state.stockMovements.set(input.movementId, {
        ...movement,
        syncStatus: "failed",
      });
    }
  },
}));

import { createSyncEngine, type SyncEngineState } from "~/features/offline/sync/sync-engine";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

describe("E2E - Offline Auto-Sync", () => {
  let engine: ReturnType<typeof createSyncEngine>;
  let states: SyncEngineState[];

  beforeEach(() => {
    state.reset();
    mockFetch.mockReset();
    eventListeners.clear();
    states = [];
    engine = createSyncEngine({ tenantId: TENANT_ID, syncIntervalMs: 60000 });
    engine.subscribe((s) => states.push(s));
  });

  describe("Offline queueing", () => {
    it("queues product creation when offline and syncs when online", async () => {
      const operationId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: productId,
        operationType: "create",
        entityType: "product",
        payload: { tenantId: TENANT_ID, name: "Test Product", price: 10 },
        status: "pending",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      state.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        syncStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{ operationId, status: "success", serverState: { id: productId } }],
        }),
      });

      await engine.sync();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/sync",
        expect.objectContaining({ method: "POST" })
      );

      const op = state.outbox.get(operationId);
      expect(op?.status).toBe("completed");

      const product = state.products.get(productId);
      expect(product?.syncStatus).toBe("synced");

      const finalState = states[states.length - 1];
      expect(finalState?.state).toBe("upToDate");

      engine.stop();
    });

    it("queues stock movement when offline and syncs when online", async () => {
      const operationId = crypto.randomUUID();
      const movementId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: movementId,
        operationType: "create",
        entityType: "stockMovement",
        payload: {
          tenantId: TENANT_ID,
          productId,
          type: "entry",
          quantity: 50,
          idempotencyKey: operationId,
        },
        status: "pending",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      state.stockMovements.set(movementId, {
        id: movementId,
        tenantId: TENANT_ID,
        productId,
        type: "entry",
        quantity: 50,
        idempotencyKey: operationId,
        clientCreatedAt: new Date().toISOString(),
        serverCreatedAt: null,
        syncedAt: null,
        syncStatus: "pending",
      });

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{ operationId, status: "success", serverState: { id: movementId } }],
        }),
      });

      await engine.sync();

      const op = state.outbox.get(operationId);
      expect(op?.status).toBe("completed");

      const movement = state.stockMovements.get(movementId);
      expect(movement?.syncStatus).toBe("synced");

      engine.stop();
    });
  });

  describe("Auto-sync on reconnect", () => {
    it("transitions to offline state when network is lost", async () => {
      state.setOnline(false);

      await engine.start();

      const offlineState = states.find((s) => s.state === "offline");
      expect(offlineState).toBeDefined();

      engine.stop();
    });

    it("triggers sync when network comes back online", async () => {
      const operationId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: productId,
        operationType: "create",
        entityType: "product",
        payload: { tenantId: TENANT_ID, name: "Test Product", price: 10 },
        status: "pending",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      state.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        syncStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      state.setOnline(false);
      await engine.start();

      expect(states.some((s) => s.state === "offline")).toBe(true);

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{ operationId, status: "success" }],
        }),
      });

      const onlineCallbacks = eventListeners.get("online");
      if (onlineCallbacks) {
        onlineCallbacks.forEach((cb) => cb());
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetch).toHaveBeenCalled();

      engine.stop();
    });
  });

  describe("Persistent error non-blocking UX", () => {
    it("remains in error state but allows continued work when sync fails", async () => {
      const operationId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: productId,
        operationType: "create",
        entityType: "product",
        payload: { tenantId: TENANT_ID, name: "Test Product", price: 10 },
        status: "pending",
        retryCount: 5,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{ operationId, status: "validation_error", message: "Invalid data" }],
        }),
      });

      await engine.sync();

      const errorState = states.find((s) => s.state === "error");
      expect(errorState).toBeDefined();
      expect(errorState?.lastError).toBeDefined();

      const op = state.outbox.get(operationId);
      expect(op?.status).toBe("failed");

      engine.stop();
    });

    it("keeps failed items queued for retry", async () => {
      const operationId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: productId,
        operationType: "create",
        entityType: "product",
        payload: { tenantId: TENANT_ID, name: "Test Product", price: 10 },
        status: "failed",
        retryCount: 1,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: "Network error",
      });

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{ operationId, status: "success" }],
        }),
      });

      await engine.sync();

      expect(mockFetch).toHaveBeenCalled();

      const callArgs = mockFetch.mock.calls[0];
      if (!callArgs) {
        throw new Error("Fetch was not called");
      }
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.operations[0].operationId).toBe(operationId);

      engine.stop();
    });
  });

  describe("Conflict resolution feedback", () => {
    it("applies server-authoritative state on conflict_resolved without blocking UI", async () => {
      const operationId = crypto.randomUUID();
      const productId = crypto.randomUUID();

      state.outbox.set(operationId, {
        id: operationId,
        operationId,
        entityId: productId,
        operationType: "update",
        entityType: "product",
        payload: { tenantId: TENANT_ID, name: "Updated Name" },
        status: "pending",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      state.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Local Name",
        syncStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      state.setOnline(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          checkpoint: new Date().toISOString(),
          results: [{
            operationId,
            status: "conflict_resolved",
            serverState: { id: productId, name: "Server Name" },
          }],
        }),
      });

      await engine.sync();

      const op = state.outbox.get(operationId);
      expect(op?.status).toBe("completed");

      const product = state.products.get(productId);
      expect(product?.syncStatus).toBe("synced");

      engine.stop();
    });
  });
});
