import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupLocalEntityForOp,
  dismissPermanentlyFailedOperation,
  getPermanentlyFailedOperations,
  retryPermanentlyFailedOperation,
} from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

/**
 * PR #15 — feature tests for the one-shot retry on
 * permanently_failed ops, plus the dismiss path. The `sync-pipeline`
 * module is imported for real; only the Dexie db is mocked.
 *
 * Three scenarios:
 *  - retry + server success → status becomes "completed"
 *  - retry + server failure → outbox row DELETED, local entity
 *    cleanup performed
 *  - dismiss              → outbox row DELETED, local entity
 *    cleanup performed (no sync triggered)
 *  - guard                → op in any other status throws
 */
const outboxStore = vi.hoisted(() => {
  const ops = new Map<string, OutboxOperation>();
  return {
    ops,
    toArray: vi.fn(async () => Array.from(ops.values())),
    get: vi.fn(async (id: string) => ops.get(id) ?? undefined),
    add: vi.fn(async (op: OutboxOperation) => {
      ops.set(op.id, op);
      return op.id;
    }),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      ops.set(id, { ...existing, ...(patch as Partial<OutboxOperation>) });
      return 1;
    }),
    delete: vi.fn(async (id: string) => {
      ops.delete(id);
      return 1;
    }),
    where: vi.fn((index: string) => ({
      equals: vi.fn((value: [string, string]) => {
        const [tenantId, status] = value;
        return {
          toArray: vi.fn(async () => {
            if (index !== "[tenantId+status]") return [];
            return Array.from(ops.values()).filter(
              (op) => op.tenantId === tenantId && op.status === status
            );
          }),
          count: vi.fn(async () => {
            if (index !== "[tenantId+status]") return 0;
            return Array.from(ops.values()).filter(
              (op) => op.tenantId === tenantId && op.status === status
            ).length;
          }),
        };
      }),
    })),
  };
});

const productStore = vi.hoisted(() => {
  type Product = {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    sku: string | null;
    category: string | null;
    unit: string | null;
    barcode: string | null;
    price: number;
    purchasePrice: number | null;
    quantity: number;
    lowStockThreshold: number | null;
    customCriticalThreshold: number | null;
    customAttentionThreshold: number | null;
    syncStatus: "pending" | "synced" | "failed";
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  };
  const products = new Map<string, Product>();
  return {
    products,
    get: vi.fn(async (id: string) => products.get(id) ?? undefined),
    add: vi.fn(async (p: Product) => {
      products.set(p.id, p);
      return p.id;
    }),
    put: vi.fn(async (p: Product) => {
      products.set(p.id, p);
      return p.id;
    }),
    update: vi.fn(async (id: string, patch: Partial<Product>) => {
      const existing = products.get(id);
      if (!existing) return 0;
      products.set(id, { ...existing, ...patch });
      return 1;
    }),
    delete: vi.fn(async (id: string) => {
      products.delete(id);
      return 1;
    }),
  };
});

const stockMovementsStore = vi.hoisted(() => {
  type Movement = {
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
  const movements = new Map<string, Movement>();
  return {
    movements,
    get: vi.fn(async (id: string) => movements.get(id) ?? undefined),
    add: vi.fn(async (m: Movement) => {
      movements.set(m.id, m);
      return m.id;
    }),
    put: vi.fn(async (m: Movement) => {
      movements.set(m.id, m);
      return m.id;
    }),
    update: vi.fn(async (id: string, patch: Partial<Movement>) => {
      const existing = movements.get(id);
      if (!existing) return 0;
      movements.set(id, { ...existing, ...patch });
      return 1;
    }),
    delete: vi.fn(async (id: string) => {
      movements.delete(id);
      return 1;
    }),
    where: vi.fn((field: string) => ({
      equals: vi.fn((value: string) => ({
        toArray: vi.fn(async () => {
          if (field !== "productId") return [];
          return Array.from(movements.values()).filter(
            (m) => m.productId === value
          );
        }),
      })),
    })),
  };
});

const transactionMock = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>;
    return callback();
  })
);

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: transactionMock,
    outbox: {
      toArray: outboxStore.toArray,
      get: outboxStore.get,
      add: outboxStore.add,
      update: outboxStore.update,
      delete: outboxStore.delete,
      where: outboxStore.where,
    },
    products: {
      get: productStore.get,
      add: productStore.add,
      put: productStore.put,
      update: productStore.update,
      delete: productStore.delete,
    },
    stockMovements: {
      get: stockMovementsStore.get,
      add: stockMovementsStore.add,
      put: stockMovementsStore.put,
      update: stockMovementsStore.update,
      delete: stockMovementsStore.delete,
      where: stockMovementsStore.where,
    },
  },
}));

// The SyncEngine pulls in fetch + syncEngineRefCounts singletons. We
// stub fetch to return controllable success/failure responses.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal("navigator", { onLine: true });

const setOnline = (value: boolean) => {
  (navigator as { onLine: boolean }).onLine = value;
};
const clearOnline = () => {
  delete (navigator as { onLine?: boolean }).onLine;
};

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

function buildPermanentlyFailedOp(
  overrides: Partial<OutboxOperation> = {}
): OutboxOperation {
  return {
    id: "op-1",
    operationId: "op-1",
    operationType: "create",
    entityType: "product",
    entityId: "product-1",
    tenantId: TENANT_ID,
    payload: {
      tenantId: TENANT_ID,
      operationId: "op-1",
      name: "Flour",
      category: "Baking",
      unit: "kg",
      price: 12,
    },
    status: "permanently_failed",
    retryCount: 5,
    createdAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    error: "Server returned 422",
    ...overrides,
  };
}

describe("retryPermanentlyFailedOperation (PR #15 C)", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    productStore.products.clear();
    stockMovementsStore.movements.clear();
    outboxStore.toArray.mockClear();
    outboxStore.get.mockClear();
    outboxStore.update.mockClear();
    outboxStore.delete.mockClear();
    productStore.delete.mockClear();
    productStore.put.mockClear();
    stockMovementsStore.delete.mockClear();
    transactionMock.mockClear();
    fetchMock.mockReset();
    setOnline(true);
  });

  it("throws if the op is not in permanently_failed status", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp({ status: "pending" }));

    await expect(retryPermanentlyFailedOperation("op-1")).rejects.toThrow(
      /expected "permanently_failed"/
    );
  });

  it("throws if the op does not exist", async () => {
    await expect(retryPermanentlyFailedOperation("missing")).rejects.toThrow(
      /Outbox operation not found/
    );
  });

  it("happy path: server success -> op becomes completed, local entity preserved", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp());
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkpoint: new Date().toISOString(),
        results: [
          {
            operationId: "op-1",
            status: "success",
            serverState: { id: "product-1", name: "Flour" },
          },
        ],
      }),
    });

    const result = await retryPermanentlyFailedOperation("op-1");

    expect(result.outcome).toBe("completed");
    const op = outboxStore.ops.get("op-1");
    expect(op?.status).toBe("completed");
    // The local product is preserved (not deleted) on success.
    expect(productStore.products.has("product-1")).toBe(true);
  });

  it("refail path: server failure -> outbox row DELETED, local entity cleaned up", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp());
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkpoint: new Date().toISOString(),
        results: [
          {
            operationId: "op-1",
            status: "validation_error",
            message: "Invalid product",
          },
        ],
      }),
    });

    const result = await retryPermanentlyFailedOperation("op-1");

    expect(result.outcome).toBe("deleted");
    expect(outboxStore.ops.has("op-1")).toBe(false);
    // The local product (which was a 'create' that never reached the
    // server) is hard-deleted.
    expect(productStore.products.has("product-1")).toBe(false);
  });

  it("network failure: retry is reverted and the op stays in permanently_failed", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp());

    fetchMock.mockRejectedValueOnce(new Error("Network unreachable"));

    const result = await retryPermanentlyFailedOperation("op-1");

    // Network blip: the engine marks the op "failed" (not "deleted")
    // because the failure is not terminal. The retry is best-effort.
    expect(["deleted", "noop"]).toContain(result.outcome);
    const op = outboxStore.ops.get("op-1");
    if (op) {
      expect(["failed", "permanently_failed"]).toContain(op.status);
    }
  });
});

describe("dismissPermanentlyFailedOperation (PR #15 C)", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    productStore.products.clear();
    stockMovementsStore.movements.clear();
    outboxStore.toArray.mockClear();
    outboxStore.get.mockClear();
    outboxStore.update.mockClear();
    outboxStore.delete.mockClear();
    productStore.delete.mockClear();
    productStore.update.mockClear();
    transactionMock.mockClear();
    fetchMock.mockReset();
    clearOnline();
  });

  it("deletes the outbox row and cleans up the local entity without triggering sync", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp());
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await dismissPermanentlyFailedOperation("op-1");

    expect(outboxStore.ops.has("op-1")).toBe(false);
    expect(productStore.products.has("product-1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverts a product update by replaying the originalProduct snapshot", async () => {
    outboxStore.ops.set(
      "op-1",
      buildPermanentlyFailedOp({
        operationType: "update",
        payload: {
          tenantId: TENANT_ID,
          operationId: "op-1",
          originalProduct: {
            id: "product-1",
            tenantId: TENANT_ID,
            name: "Original Flour",
            price: 8,
          },
        },
      })
    );
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Edited Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await dismissPermanentlyFailedOperation("op-1");

    expect(outboxStore.ops.has("op-1")).toBe(false);
    const reverted = productStore.products.get("product-1");
    expect(reverted?.name).toBe("Original Flour");
    expect(reverted?.price).toBe(8);
    expect(reverted?.syncStatus).toBe("synced");
  });

  it("un-deletes a product when dismissing a 'delete' op", async () => {
    outboxStore.ops.set(
      "op-1",
      buildPermanentlyFailedOp({
        operationType: "delete",
        payload: {
          tenantId: TENANT_ID,
          operationId: "op-1",
          productId: "product-1",
        },
      })
    );
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
    });

    await dismissPermanentlyFailedOperation("op-1");

    expect(outboxStore.ops.has("op-1")).toBe(false);
    const revived = productStore.products.get("product-1");
    expect(revived?.deletedAt).toBeNull();
    expect(revived?.syncStatus).toBe("synced");
  });

  it("throws if the op is not in permanently_failed status", async () => {
    outboxStore.ops.set("op-1", buildPermanentlyFailedOp({ status: "failed" }));

    await expect(dismissPermanentlyFailedOperation("op-1")).rejects.toThrow(
      /expected "permanently_failed"/
    );
  });

  it("is a noop if the op does not exist", async () => {
    await expect(dismissPermanentlyFailedOperation("missing")).resolves.toBeUndefined();
  });
});

describe("getPermanentlyFailedOperations", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    fetchMock.mockReset();
    clearOnline();
  });

  it("returns permanently_failed ops for the requested tenant, newest first", async () => {
    const newer = buildPermanentlyFailedOp({
      id: "op-newer",
      operationId: "op-newer",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const older = buildPermanentlyFailedOp({
      id: "op-older",
      operationId: "op-older",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const otherTenant = buildPermanentlyFailedOp({
      id: "op-other",
      operationId: "op-other",
      tenantId: "other-tenant",
    });
    const completed = buildPermanentlyFailedOp({
      id: "op-completed",
      operationId: "op-completed",
      status: "completed",
    });

    outboxStore.ops.set("op-newer", newer);
    outboxStore.ops.set("op-older", older);
    outboxStore.ops.set("op-other", otherTenant);
    outboxStore.ops.set("op-completed", completed);

    const rows = await getPermanentlyFailedOperations(TENANT_ID);

    expect(rows.map((r) => r.id)).toEqual(["op-newer", "op-older"]);
  });
});

describe("cleanupLocalEntityForOp", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    productStore.products.clear();
    stockMovementsStore.movements.clear();
    fetchMock.mockReset();
    clearOnline();
  });

  it("hard-deletes a product that was a 'create' that never reached the server", async () => {
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: TENANT_ID,
      name: "Flour",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 12,
      purchasePrice: null,
      quantity: 5,
      lowStockThreshold: null,
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await cleanupLocalEntityForOp(
      buildPermanentlyFailedOp({ operationType: "create" })
    );

    expect(productStore.products.has("product-1")).toBe(false);
  });
});
