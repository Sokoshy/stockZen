import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetch,
  mockDbOutbox,
  mockDbStockMovements,
  mockDbProducts,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockTransaction: vi.fn(async (...args: unknown[]) => {
    // Dexie-style: transaction(mode, ...tables, callback)
    const callback = args[args.length - 1] as () => Promise<unknown>;
    return callback();
  }),
  mockDbOutbox: {
    toArray: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
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
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: mockTransaction,
    outbox: mockDbOutbox,
    stockMovements: mockDbStockMovements,
    products: mockDbProducts,
  },
}));

vi.mock("~/features/offline/sync-pipeline", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("~/features/offline/sync-pipeline")
  >();
  return {
    ...original,
    markOperationCompleted: vi.fn(),
    markOperationFailed: vi.fn(),
    markOperationProcessing: vi.fn(),
    updateProductSyncStatus: vi.fn(),
    applyServerProductState: vi.fn(),
    markMovementSynced: vi.fn(),
    markMovementSyncFailed: vi.fn(),
    claimPendingOperations: vi.fn(
      async (
        tenantId: string,
        _maxRetries: number,
        _baseRetryDelayMs: number,
        _maxRetryDelayMs: number
      ) => {
        const allOps = await mockDbOutbox.toArray();
        return allOps.filter(
          (op: { payload: { tenantId?: string }; status: string }) => {
            if (op.status !== "pending" && op.status !== "failed") {
              return false;
            }
            return (
              (op.payload as { tenantId?: string }).tenantId === tenantId
            );
          }
        );
      }
    ),
  };
});

import {
  createSyncEngine,
  type SyncEngineState,
} from "~/features/offline/sync-pipeline";

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
        json: async () => ({
          checkpoint: "2026-01-01T00:00:00Z",
          results: [],
        }),
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
    it("calculates exponential backoff delay with jitter", () => {
      const engineWithConfig = createSyncEngine({
        tenantId,
        baseRetryDelayMs: 1000,
        maxRetryDelayMs: 60000,
      });

      // With ±20% jitter, values should be within range
      const d0 = engineWithConfig.calculateRetryDelay(0);
      expect(d0).toBeGreaterThanOrEqual(800);
      expect(d0).toBeLessThanOrEqual(1200);

      const d1 = engineWithConfig.calculateRetryDelay(1);
      expect(d1).toBeGreaterThanOrEqual(1600);
      expect(d1).toBeLessThanOrEqual(2400);

      const d2 = engineWithConfig.calculateRetryDelay(2);
      expect(d2).toBeGreaterThanOrEqual(3200);
      expect(d2).toBeLessThanOrEqual(4800);

      const d3 = engineWithConfig.calculateRetryDelay(3);
      expect(d3).toBeGreaterThanOrEqual(6400);
      expect(d3).toBeLessThanOrEqual(9600);

      engineWithConfig.stop();
    });

    it("caps delay at maxRetryDelayMs", () => {
      const engineWithConfig = createSyncEngine({
        tenantId,
        baseRetryDelayMs: 1000,
        maxRetryDelayMs: 10000,
      });

      expect(engineWithConfig.calculateRetryDelay(10)).toBeLessThanOrEqual(
        10000
      );
      expect(engineWithConfig.calculateRetryDelay(20)).toBeLessThanOrEqual(
        10000
      );

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
