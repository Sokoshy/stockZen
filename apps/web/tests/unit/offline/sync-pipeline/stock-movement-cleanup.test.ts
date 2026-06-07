import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupLocalEntityForOp } from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000002";

const productStore = vi.hoisted(() => {
  type Product = {
    id: string;
    tenantId: string;
    name: string;
    quantity: number;
    syncStatus: string;
  };
  const products = new Map<string, Product>();
  return {
    products,
    get: vi.fn(async (id: string) => products.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Partial<Product>) => {
      const existing = products.get(id);
      if (!existing) return 0;
      products.set(id, { ...existing, ...patch });
      return 1;
    }),
    delete: vi.fn(async (id: string) => {
      products.delete(id);
    }),
  };
});

const stockMovementStore = vi.hoisted(() => {
  type Movement = {
    id: string;
    tenantId: string;
    productId: string;
    type: string;
    quantity: number;
    syncStatus: string;
  };
  const movements = new Map<string, Movement>();
  return {
    movements,
    get: vi.fn(async (id: string) => movements.get(id) ?? undefined),
    where: vi.fn((index: string) => ({
      equals: vi.fn((value: string) => ({
        toArray: vi.fn(async () => {
          return Array.from(movements.values()).filter((m) => m.productId === value);
        }),
      })),
    })),
    delete: vi.fn(async (id: string) => {
      movements.delete(id);
    }),
  };
});

const outboxStore = vi.hoisted(() => {
  return {
    delete: vi.fn(async () => {}),
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: vi.fn(async (...args: any[]) => {
      const fn = args[args.length - 1];
      return fn();
    }),
    products: {
      get: productStore.get,
      update: productStore.update,
      delete: productStore.delete,
    },
    stockMovements: {
      get: stockMovementStore.get,
      where: stockMovementStore.where,
      delete: stockMovementStore.delete,
    },
    outbox: {
      delete: outboxStore.delete,
    },
  },
}));

describe("cleanupLocalEntityForOp", () => {
  beforeEach(() => {
    productStore.products.clear();
    stockMovementStore.movements.clear();
    vi.clearAllMocks();
  });

  describe("stockMovement cleanup - C2 fix", () => {
    it("should include pending and processing movements in quantity recomputation", async () => {
      const productId = "product-1";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        quantity: 100,
        syncStatus: "synced",
      });

      stockMovementStore.movements.set("movement-1", {
        id: "movement-1",
        tenantId: TENANT_ID,
        productId,
        type: "entry",
        quantity: 10,
        syncStatus: "synced",
      });

      stockMovementStore.movements.set("movement-2", {
        id: "movement-2",
        tenantId: TENANT_ID,
        productId,
        type: "entry",
        quantity: 5,
        syncStatus: "pending",
      });

      stockMovementStore.movements.set("movement-3", {
        id: "movement-3",
        tenantId: TENANT_ID,
        productId,
        type: "exit",
        quantity: 3,
        syncStatus: "processing",
      });

      const op: OutboxOperation = {
        id: "op-1",
        operationId: "op-1",
        operationType: "create",
        entityType: "stockMovement",
        entityId: "movement-failed",
        tenantId: TENANT_ID,
        status: "permanently_failed",
        retryCount: 3,
        payload: {
          productId,
          type: "entry",
          quantity: 7,
        },
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      };

      stockMovementStore.movements.set("movement-failed", {
        id: "movement-failed",
        tenantId: TENANT_ID,
        productId,
        type: "entry",
        quantity: 7,
        syncStatus: "failed",
      });

      await cleanupLocalEntityForOp(op);

      expect(stockMovementStore.movements.has("movement-failed")).toBe(false);

      const updatedProduct = productStore.products.get(productId);
      expect(updatedProduct?.quantity).toBe(12);
    });
  });

  describe("tenant guard - S2 fix", () => {
    it("should not cleanup product from different tenant", async () => {
      const productId = "product-other-tenant";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Other Tenant Product",
        quantity: 50,
        syncStatus: "synced",
      });

      const op: OutboxOperation = {
        id: "op-wrong",
        operationId: "op-wrong",
        operationType: "create",
        entityType: "product",
        entityId: productId,
        tenantId: OTHER_TENANT_ID,
        status: "permanently_failed",
        retryCount: 3,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      };

      await cleanupLocalEntityForOp(op);

      expect(productStore.products.has(productId)).toBe(true);
      expect(productStore.products.get(productId)?.quantity).toBe(50);
    });

    it("should cleanup product from correct tenant", async () => {
      const productId = "product-correct";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Correct Tenant Product",
        quantity: 25,
        syncStatus: "synced",
      });

      const op: OutboxOperation = {
        id: "op-correct",
        operationId: "op-correct",
        operationType: "create",
        entityType: "product",
        entityId: productId,
        tenantId: TENANT_ID,
        status: "permanently_failed",
        retryCount: 3,
        payload: {},
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      };

      await cleanupLocalEntityForOp(op);

      expect(productStore.products.has(productId)).toBe(false);
    });
  });
});
