import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryPermanentlyFailedOperation } from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const outboxStore = vi.hoisted(() => {
  const ops = new Map<string, OutboxOperation>();
  let transactionCount = 0;
  let concurrentTransactions = 0;
  let maxConcurrent = 0;

  return {
    ops,
    getTransactionStats: () => ({ transactionCount, maxConcurrent }),
    resetStats: () => {
      transactionCount = 0;
      concurrentTransactions = 0;
      maxConcurrent = 0;
    },
    get: vi.fn(async (id: string) => ops.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      ops.set(id, { ...existing, ...(patch as Partial<OutboxOperation>) });
      return 1;
    }),
  };
});

const productStore = vi.hoisted(() => {
  return {
    get: vi.fn(async () => undefined),
  };
});

const stockMovementStore = vi.hoisted(() => {
  return {
    get: vi.fn(async () => undefined),
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
      toArray: vi.fn(async () => Array.from(outboxStore.ops.values())),
    },
    products: {
      get: productStore.get,
    },
    stockMovements: {
      get: stockMovementStore.get,
      where: stockMovementStore.where,
    },
  },
}));

vi.mock("~/features/offline/sync-pipeline", async () => {
  const actual = await vi.importActual("~/features/offline/sync-pipeline");
  return {
    ...actual,
    acquireSyncEngine: vi.fn(() => ({
      sync: vi.fn(async () => {}),
    })),
  };
});

describe("concurrent retry - W5 fix", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    outboxStore.resetStats();
    vi.clearAllMocks();
  });

  it("should fail if operation is not in permanently_failed status", async () => {
    const operationId = "op-wrong-status";

    outboxStore.ops.set(operationId, {
      id: operationId,
      operationId,
      operationType: "create",
      entityType: "product",
      entityId: "product-1",
      tenantId: TENANT_ID,
      status: "pending",
      retryCount: 0,
      payload: { tenantId: TENANT_ID },
      createdAt: new Date().toISOString(),
      processedAt: null,
      error: null,
    });

    await expect(
      retryPermanentlyFailedOperation(operationId, TENANT_ID)
    ).rejects.toThrow('Cannot retry operation in status "pending"');
  });

  it("should reset retryCount and set oneShotRetry flag", async () => {
    const operationId = "op-reset";

    outboxStore.ops.set(operationId, {
      id: operationId,
      operationId,
      operationType: "create",
      entityType: "product",
      entityId: "product-1",
      tenantId: TENANT_ID,
      status: "permanently_failed",
      retryCount: 5,
      error: "Previous error",
      payload: { tenantId: TENANT_ID },
      createdAt: new Date().toISOString(),
      processedAt: null,
    });

    await retryPermanentlyFailedOperation(operationId, TENANT_ID);

    const updatedOp = outboxStore.ops.get(operationId);
    expect(updatedOp?.status).toBe("pending");
    expect(updatedOp?.retryCount).toBe(0);
    expect(updatedOp?.error).toBeNull();
    expect(updatedOp?.oneShotRetry).toBe(true);
  });
});
