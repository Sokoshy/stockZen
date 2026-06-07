import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markOperationCompleted,
  markOperationFailed,
} from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const outboxStore = vi.hoisted(() => {
  const ops = new Map<string, OutboxOperation>();
  return {
    ops,
    get: vi.fn(async (id: string) => ops.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      ops.set(id, { ...existing, ...(patch as Partial<OutboxOperation>) });
      return 1;
    }),
    toArray: vi.fn(async () => Array.from(ops.values())),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => []),
      })),
    })),
  };
});

const productStore = vi.hoisted(() => {
  const products = new Map<string, unknown>();
  return {
    products,
    get: vi.fn(async (id: string) => products.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = products.get(id);
      if (!existing) return 0;
      products.set(id, { ...existing, ...patch });
      return 1;
    }),
  };
});

const stockMovementStore = vi.hoisted(() => {
  const movements = new Map<string, unknown>();
  return {
    movements,
    get: vi.fn(async (id: string) => movements.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = movements.get(id);
      if (!existing) return 0;
      movements.set(id, { ...existing, ...patch });
      return 1;
    }),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => []),
      })),
    })),
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: vi.fn(async (...args: any[]) => {
      const fn = args[args.length - 1];
      return fn();
    }),
    outbox: {
      get: outboxStore.get,
      update: outboxStore.update,
      toArray: outboxStore.toArray,
      where: outboxStore.where,
    },
    products: {
      get: productStore.get,
      update: productStore.update,
    },
    stockMovements: {
      get: stockMovementStore.get,
      update: stockMovementStore.update,
      where: stockMovementStore.where,
    },
  },
}));

describe("C1 fix - double-call prevention", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    stockMovementStore.movements.clear();
    productStore.products.clear();
    vi.clearAllMocks();
  });

  describe("markOperationCompleted is called once per operation", () => {
    it("should update outbox status to completed", async () => {
      const operationId = "op-1";
      const serverMovementId = "server-movement-1";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "stockMovement",
        entityId: "movement-1",
        tenantId: TENANT_ID,
        status: "processing",
        retryCount: 0,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await markOperationCompleted(operationId, serverMovementId);

      const updatedOp = outboxStore.ops.get(operationId);
      expect(updatedOp?.status).toBe("completed");
      expect(updatedOp?.processedAt).toBeDefined();
    });

    it("should be idempotent - calling twice does not corrupt state", async () => {
      const operationId = "op-2";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "product",
        entityId: "product-1",
        tenantId: TENANT_ID,
        status: "processing",
        retryCount: 0,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await markOperationCompleted(operationId);
      const afterFirst = { ...outboxStore.ops.get(operationId) };

      await markOperationCompleted(operationId);
      const afterSecond = outboxStore.ops.get(operationId);

      expect(afterSecond?.status).toBe(afterFirst.status);
      expect(afterSecond?.processedAt).toBe(afterFirst.processedAt);
    });
  });

  describe("markOperationFailed increments retryCount correctly", () => {
    it("should increment retryCount by exactly 1", async () => {
      const operationId = "op-3";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "product",
        entityId: "product-1",
        tenantId: TENANT_ID,
        status: "processing",
        retryCount: 2,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await markOperationFailed(operationId, "Test error", 5);

      const updatedOp = outboxStore.ops.get(operationId);
      expect(updatedOp?.retryCount).toBe(3);
      expect(updatedOp?.status).toBe("failed");
      expect(updatedOp?.error).toBe("Test error");
    });

    it("should transition to permanently_failed when retryCount reaches maxRetries", async () => {
      const operationId = "op-4";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "product",
        entityId: "product-1",
        tenantId: TENANT_ID,
        status: "processing",
        retryCount: 4,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await markOperationFailed(operationId, "Final error", 5);

      const updatedOp = outboxStore.ops.get(operationId);
      expect(updatedOp?.retryCount).toBe(5);
      expect(updatedOp?.status).toBe("permanently_failed");
      expect(updatedOp?.error).toBe("Final error");
    });
  });
});
