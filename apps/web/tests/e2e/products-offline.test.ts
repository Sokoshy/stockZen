import { beforeEach, describe, expect, it, vi } from "vitest";

type MockProduct = {
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
  syncStatus: "pending" | "synced" | "failed";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type MockOutboxOperation = {
  id: string;
  operationId: string;
  operationType: "create" | "update" | "delete";
  entityType: "product";
  entityId: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  createdAt: string;
  processedAt: string | null;
  error: string | null;
};

const state = vi.hoisted(() => {
  const products = new Map<string, MockProduct>();
  const outbox = new Map<string, MockOutboxOperation>();

  function getProductsArray() {
    return Array.from(products.values());
  }

  function getOutboxArray() {
    return Array.from(outbox.values());
  }

  return {
    products,
    outbox,
    reset() {
      products.clear();
      outbox.clear();
    },
    getProductsArray,
    getOutboxArray,
  };
});

vi.mock("~/features/offline/database", () => {
  const productsWhere = (field: keyof MockProduct) => ({
    equals(value: unknown) {
      const base = state.getProductsArray().filter((item) => item[field] === value);
      return {
        and(predicate: (item: MockProduct) => boolean) {
          const filtered = base.filter(predicate);
          return {
            toArray: async () => filtered,
            first: async () => filtered[0],
          };
        },
        toArray: async () => base,
        first: async () => base[0],
      };
    },
  });

  const outboxWhere = (field: keyof MockOutboxOperation) => ({
    equals(value: unknown) {
      const base = state.getOutboxArray().filter((item) => item[field] === value);
      return {
        and(predicate: (item: MockOutboxOperation) => boolean) {
          const filtered = base.filter(predicate);
          return {
            toArray: async () => filtered,
          };
        },
        toArray: async () => base,
      };
    },
  });

  return {
    db: {
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
      products: {
        add: async (product: MockProduct) => {
          state.products.set(product.id, product);
        },
        put: async (product: MockProduct) => {
          state.products.set(product.id, product);
        },
        get: async (id: string) => state.products.get(id),
        update: async (id: string, patch: Partial<MockProduct>) => {
          const existing = state.products.get(id);
          if (!existing) return;
          state.products.set(id, { ...existing, ...patch });
        },
        delete: async (id: string) => {
          state.products.delete(id);
        },
        where: productsWhere,
      },
      outbox: {
        delete: async (id: string) => {
          state.outbox.delete(id);
        },
        where: outboxWhere,
      },
    },
  };
});

vi.mock("~/features/offline/outbox", () => ({
  enqueueOperation: async (input: {
    operationId?: string;
    operationType: "create" | "update" | "delete";
    entityType: "product";
    entityId: string;
    payload: Record<string, unknown>;
  }) => {
    const operationId = input.operationId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    state.outbox.set(operationId, {
      id: operationId,
      operationId,
      operationType: input.operationType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: {
        ...input.payload,
        operationId,
      },
      status: "pending",
      retryCount: 0,
      createdAt: now,
      processedAt: null,
      error: null,
    });

    return operationId;
  },
}));

import {
  createProductOffline,
  deleteProductOffline,
  getLocalProducts,
  restoreProduct,
  updateProductOffline,
} from "~/features/offline/product-operations";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

describe("E2E - Offline edit/delete flow", () => {
  beforeEach(() => {
    state.reset();
  });

  it("edits offline, deletes offline, then restores from undo", async () => {
    const created = await createProductOffline({
      tenantId: TENANT_ID,
      name: "Flour",
      category: "Baking",
      unit: "kg",
      barcode: "FLOUR-001",
      price: 12,
      purchasePrice: 7,
      quantity: 40,
      lowStockThreshold: 15,
    });

    await updateProductOffline({
      id: created.id,
      tenantId: TENANT_ID,
      name: "Flour T55",
      price: 13,
      barcode: "FLOUR-002",
    });

    let localProducts = await getLocalProducts(TENANT_ID);
    expect(localProducts).toHaveLength(1);
    expect(localProducts[0]?.name).toBe("Flour T55");
    expect(localProducts[0]?.price).toBe(13);
    expect(localProducts[0]?.barcode).toBe("FLOUR-002");
    expect(localProducts[0]?.syncStatus).toBe("pending");

    const pendingAfterUpdate = state
      .getOutboxArray()
      .filter((operation) => operation.status === "pending");

    expect(pendingAfterUpdate).toHaveLength(2);
    expect(
      pendingAfterUpdate.every(
        (operation) => (operation.payload as { tenantId?: unknown }).tenantId === TENANT_ID
      )
    ).toBe(true);

    await deleteProductOffline({
      id: created.id,
      tenantId: TENANT_ID,
      originalProductName: "Flour T55",
    });

    localProducts = await getLocalProducts(TENANT_ID);
    expect(localProducts).toHaveLength(0);

    const pendingAfterDelete = state
      .getOutboxArray()
      .filter((operation) => operation.status === "pending");
    expect(pendingAfterDelete.some((operation) => operation.operationType === "delete")).toBe(
      true
    );

    await restoreProduct(created.id);

    localProducts = await getLocalProducts(TENANT_ID);
    expect(localProducts).toHaveLength(1);
    expect(localProducts[0]?.id).toBe(created.id);

    const pendingAfterRestore = state
      .getOutboxArray()
      .filter((operation) => operation.status === "pending");
    expect(pendingAfterRestore.some((operation) => operation.operationType === "delete")).toBe(
      false
    );
  });
});
