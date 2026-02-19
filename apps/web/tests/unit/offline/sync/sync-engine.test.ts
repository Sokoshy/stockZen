import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetch,
  mockDbOutbox,
  mockDbStockMovements,
  mockDbProducts,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockDbOutbox: {
    toArray: vi.fn(),
    update: vi.fn(),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
  mockDbStockMovements: {
    update: vi.fn(),
  },
  mockDbProducts: {
    update: vi.fn(),
  },
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("~/features/offline/database", () => ({
  db: {
    outbox: mockDbOutbox,
    stockMovements: mockDbStockMovements,
    products: mockDbProducts,
  },
}));

vi.mock("~/features/offline/outbox", () => ({
  markOperationCompleted: vi.fn(),
  markOperationFailed: vi.fn(),
  markOperationProcessing: vi.fn(),
}));

vi.mock("~/features/offline/product-operations", () => ({
  updateProductSyncStatus: vi.fn(),
  applyServerProductState: vi.fn(),
}));

vi.mock("~/features/offline/movement-operations", () => ({
  markMovementSynced: vi.fn(),
  markMovementSyncFailed: vi.fn(),
}));

import { createSyncEngine, type SyncEngineState } from "~/features/offline/sync/sync-engine";

describe("SyncEngine", () => {
  const tenantId = "test-tenant-id";
  let engine: ReturnType<typeof createSyncEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockDbOutbox.toArray.mockReset();
    engine = createSyncEngine({ tenantId, syncIntervalMs: 60000 });
  });

  describe("state machine transitions", () => {
    it("starts with offline state when navigator.onLine is false", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      
      const states: SyncEngineState[] = [];
      const unsubscribe = engine.subscribe((state) => states.push(state));
      
      await engine.start();
      
      expect(states[0]?.state).toBe("offline");
      
      unsubscribe();
      engine.stop();
    });

    it("transitions to upToDate when no pending operations exist", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      mockDbOutbox.toArray.mockResolvedValue([]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ checkpoint: "2026-01-01T00:00:00Z", results: [] }),
      });

      const states: SyncEngineState[] = [];
      const unsubscribe = engine.subscribe((state) => states.push(state));
      
      await engine.sync();
      
      const finalState = states[states.length - 1];
      expect(finalState?.state).toBe("upToDate");
      expect(finalState?.pendingCount).toBe(0);
      
      unsubscribe();
      engine.stop();
    });

    it("transitions to syncing when pending operations exist", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      mockDbOutbox.toArray.mockResolvedValue([
        {
          id: "op-1",
          operationId: "op-1",
          entityType: "product",
          entityId: "entity-1",
          operationType: "create",
          status: "pending",
          payload: { tenantId },
          retryCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          processedAt: null,
          error: null,
        },
      ]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          checkpoint: "2026-01-01T00:00:00Z",
          results: [{ operationId: "op-1", status: "success" }],
        }),
      });

      const states: SyncEngineState[] = [];
      const unsubscribe = engine.subscribe((state) => states.push(state));
      
      await engine.sync();
      
      const syncingState = states.find((s) => s.state === "syncing");
      expect(syncingState).toBeDefined();
      
      unsubscribe();
      engine.stop();
    });
  });

  describe("retry/backoff behavior", () => {
    it("calculates exponential backoff delay", () => {
      const engineWithConfig = createSyncEngine({
        tenantId,
        baseRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      expect(engineWithConfig.calculateRetryDelay(0)).toBe(1000);
      expect(engineWithConfig.calculateRetryDelay(1)).toBe(2000);
      expect(engineWithConfig.calculateRetryDelay(2)).toBe(4000);
      expect(engineWithConfig.calculateRetryDelay(3)).toBe(8000);
      
      engineWithConfig.stop();
    });

    it("caps delay at maxRetryDelayMs", () => {
      const engineWithConfig = createSyncEngine({
        tenantId,
        baseRetryDelayMs: 1000,
        maxRetryDelayMs: 10000,
      });

      expect(engineWithConfig.calculateRetryDelay(10)).toBe(10000);
      expect(engineWithConfig.calculateRetryDelay(20)).toBe(10000);
      
      engineWithConfig.stop();
    });
  });

  describe("idempotency handling", () => {
    it("includes operationId in sync request payload", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      const operation = {
        id: "op-1",
        operationId: "op-id-123",
        entityId: "entity-1",
        entityType: "product" as const,
        operationType: "create" as const,
        status: "pending" as const,
        payload: { tenantId, name: "Test Product" },
        retryCount: 0,
        createdAt: "2026-01-01T00:00:00Z",
        processedAt: null,
        error: null,
      };
      
      mockDbOutbox.toArray.mockResolvedValue([operation]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          checkpoint: "2026-01-01T00:00:00Z",
          results: [{ operationId: "op-id-123", status: "success" }],
        }),
      });

      await engine.sync();

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/sync",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      if (!callArgs) {
        throw new Error("Fetch was not called");
      }
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.operations[0].operationId).toBe("op-id-123");
      expect(body.operations[0].idempotencyKey).toBe("op-id-123");
      expect(body.operations[0].entityId).toBe("entity-1");
      
      engine.stop();
    });
  });

  describe("tenant filtering", () => {
    it("only syncs operations for the current tenant", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      
      const operations = [
        {
          id: "op-1",
          operationId: "op-1",
          entityId: "entity-1",
          entityType: "product" as const,
          operationType: "create" as const,
          status: "pending" as const,
          payload: { tenantId, name: "Product 1" },
          retryCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          processedAt: null,
          error: null,
        },
        {
          id: "op-2",
          operationId: "op-2",
          entityId: "entity-2",
          entityType: "product" as const,
          operationType: "create" as const,
          status: "pending" as const,
          payload: { tenantId: "other-tenant", name: "Product 2" },
          retryCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          processedAt: null,
          error: null,
        },
      ];
      
      mockDbOutbox.toArray.mockResolvedValue(operations);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          checkpoint: "2026-01-01T00:00:00Z",
          results: [{ operationId: "op-1", status: "success" }],
        }),
      });

      await engine.sync();

      const callArgs = mockFetch.mock.calls[0];
      if (!callArgs) {
        throw new Error("Fetch was not called");
      }
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.operations).toHaveLength(1);
      expect(body.operations[0].operationId).toBe("op-1");
      
      engine.stop();
    });
  });

  describe("rate limiting handling", () => {
    it("sets error state on HTTP 429 response", async () => {
      vi.stubGlobal("navigator", { onLine: true });
      mockDbOutbox.toArray.mockResolvedValue([
        {
          id: "op-1",
          operationId: "op-1",
          entityId: "entity-1",
          entityType: "product" as const,
          operationType: "create" as const,
          status: "pending" as const,
          payload: { tenantId },
          retryCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          processedAt: null,
          error: null,
        },
      ]);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const states: SyncEngineState[] = [];
      const unsubscribe = engine.subscribe((state) => states.push(state));
      
      await engine.sync();
      
      const errorState = states.find((s) => s.state === "error");
      expect(errorState?.lastError).toContain("Rate limited");
      
      unsubscribe();
      engine.stop();
    });
  });
});
