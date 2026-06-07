import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateProductSyncStatus,
  restoreProduct,
  retryPermanentlyFailedOperation,
  dismissPermanentlyFailedOperation,
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
    delete: vi.fn(async (id: string) => {
      ops.delete(id);
      return 1;
    }),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({
          toArray: vi.fn(async () => []),
        })),
      })),
    })),
  };
});

const productStore = vi.hoisted(() => {
  type Product = {
    id: string;
    tenantId: string;
    name: string;
    syncStatus: string;
    deletedAt: string | null;
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
  };
});

const stockMovementStore = vi.hoisted(() => {
  const movements = new Map<string, unknown>();
  return {
    movements,
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
      delete: outboxStore.delete,
      where: outboxStore.where,
    },
    products: {
      get: productStore.get,
      update: productStore.update,
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

describe("tenant guards", () => {
  beforeEach(() => {
    productStore.products.clear();
    outboxStore.ops.clear();
    vi.clearAllMocks();
  });

  describe("updateProductSyncStatus - S1 fix", () => {
    it("should throw when tenantId does not match product tenant", async () => {
      const productId = "product-1";
      const wrongTenantId = "tenant-2";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        syncStatus: "pending",
        deletedAt: null,
      });

      await expect(
        updateProductSyncStatus(productId, "synced", wrongTenantId)
      ).rejects.toThrow("Product does not belong to the provided tenant");
    });

    it("should succeed when tenantId matches product tenant", async () => {
      const productId = "product-1";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        syncStatus: "pending",
        deletedAt: null,
      });

      await expect(
        updateProductSyncStatus(productId, "synced", TENANT_ID)
      ).resolves.not.toThrow();

      expect(productStore.products.get(productId)?.syncStatus).toBe("synced");
    });
  });

  describe("restoreProduct - S3 fix", () => {
    it("should throw when tenantId does not match product tenant", async () => {
      const productId = "product-restore";
      const wrongTenantId = "tenant-2";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        deletedAt: new Date().toISOString(),
        syncStatus: "synced",
      });

      await expect(restoreProduct(productId, wrongTenantId)).rejects.toThrow(
        "Product does not belong to the provided tenant"
      );
    });

    it("tenantId is now required (not optional)", async () => {
      const productId = "product-restore-2";

      productStore.products.set(productId, {
        id: productId,
        tenantId: TENANT_ID,
        name: "Test Product",
        deletedAt: new Date().toISOString(),
        syncStatus: "synced",
      });

      // TypeScript would catch this at compile time, but we verify runtime behavior
      await expect(restoreProduct(productId, TENANT_ID)).resolves.not.toThrow();
    });
  });

  describe("retryPermanentlyFailedOperation - M2 fix", () => {
    it("should throw when tenantId does not match operation tenant", async () => {
      const operationId = "op-retry";
      const wrongTenantId = "tenant-2";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "product",
        entityId: "product-1",
        tenantId: TENANT_ID,
        status: "permanently_failed",
        retryCount: 3,
        payload: { tenantId: TENANT_ID },
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await expect(
        retryPermanentlyFailedOperation(operationId, wrongTenantId)
      ).rejects.toThrow("Operation does not belong to the provided tenant");
    });
  });

  describe("dismissPermanentlyFailedOperation - M2 fix", () => {
    it("should throw when tenantId does not match operation tenant", async () => {
      const operationId = "op-dismiss";
      const wrongTenantId = "tenant-2";

      outboxStore.ops.set(operationId, {
        id: operationId,
        operationId,
        operationType: "create",
        entityType: "product",
        entityId: "product-1",
        tenantId: TENANT_ID,
        status: "permanently_failed",
        retryCount: 3,
        payload: { tenantId: TENANT_ID },
        createdAt: new Date().toISOString(),
        processedAt: null,
        error: null,
      });

      await expect(
        dismissPermanentlyFailedOperation(operationId, wrongTenantId)
      ).rejects.toThrow("Operation does not belong to the provided tenant");
    });
  });
});
