import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, enqueueOperationMock } = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      return callback();
    }),
    products: {
      get: vi.fn(),
      put: vi.fn(),
      update: vi.fn(),
    },
    outbox: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
      delete: vi.fn(),
    },
  },
  enqueueOperationMock: vi.fn(),
}));

vi.mock("~/features/offline/database", () => ({
  db: mockDb,
}));

vi.mock("~/features/offline/outbox", () => ({
  enqueueOperation: enqueueOperationMock,
}));

import {
  updateProductOffline,
  deleteProductOffline,
  restoreProduct,
} from "~/features/offline/product-operations";

describe("updateProductOffline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a local product and enqueues update operation", async () => {
    const now = "2026-02-16T12:00:00.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const existingProduct = {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Old Name",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 10,
      purchasePrice: 5,
      quantity: 5,
      lowStockThreshold: null,
      syncStatus: "synced" as const,
      createdAt: "2026-02-15T10:00:00.000Z",
      updatedAt: "2026-02-15T10:00:00.000Z",
      deletedAt: null,
    };

    mockDb.products.get.mockResolvedValue(existingProduct);
    mockDb.products.put.mockResolvedValue(undefined);
    enqueueOperationMock.mockResolvedValue("operation-id-002");

    const result = await updateProductOffline({
      id: "product-1",
      tenantId: "tenant-1",
      name: "New Name",
      price: 15,
    });

    expect(mockDb.products.get).toHaveBeenCalledWith("product-1");
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.products.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "product-1",
        name: "New Name",
        price: 15,
        purchasePrice: 5,
        syncStatus: "pending",
        updatedAt: now,
      })
    );

    expect(enqueueOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "update",
        entityType: "product",
        entityId: "product-1",
        payload: expect.objectContaining({
          tenantId: "tenant-1",
          originalProduct: expect.objectContaining({
            name: "Old Name",
            price: 10,
          }),
          updatedFields: expect.objectContaining({
            name: "New Name",
            price: 15,
          }),
        }),
      })
    );

    expect(result.name).toBe("New Name");
    expect(result.syncStatus).toBe("pending");

    vi.useRealTimers();
  });

  it("throws error if product not found", async () => {
    mockDb.products.get.mockResolvedValue(undefined);

    await expect(
      updateProductOffline({
        id: "non-existent",
        tenantId: "tenant-1",
        name: "New Name",
      })
    ).rejects.toThrow("Product not found in local database");
  });
});

describe("deleteProductOffline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks product as deleted and enqueues delete operation", async () => {
    const now = "2026-02-16T12:00:00.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const existingProduct = {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Product to Delete",
      description: null,
      sku: null,
      category: "Baking",
      unit: "kg",
      barcode: null,
      price: 10,
      purchasePrice: 5,
      quantity: 5,
      lowStockThreshold: null,
      syncStatus: "synced" as const,
      createdAt: "2026-02-15T10:00:00.000Z",
      updatedAt: "2026-02-15T10:00:00.000Z",
      deletedAt: null,
    };

    mockDb.products.get.mockResolvedValue(existingProduct);
    mockDb.products.update.mockResolvedValue(undefined);
    enqueueOperationMock.mockResolvedValue("operation-id-003");

    await deleteProductOffline({
      id: "product-1",
      tenantId: "tenant-1",
      originalProductName: "Product to Delete",
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.products.update).toHaveBeenCalledWith("product-1", {
      deletedAt: now,
      syncStatus: "pending",
      updatedAt: now,
    });

    expect(enqueueOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "delete",
        entityType: "product",
        entityId: "product-1",
        payload: expect.objectContaining({
          tenantId: "tenant-1",
          productId: "product-1",
          originalProductName: "Product to Delete",
        }),
      })
    );

    vi.useRealTimers();
  });
});

describe("restoreProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores a deleted product by clearing deletedAt", async () => {
    const now = "2026-02-16T12:00:00.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const deletedProduct = {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Deleted Product",
      deletedAt: "2026-02-16T11:00:00.000Z",
    };

    mockDb.products.get.mockResolvedValue(deletedProduct);
    mockDb.products.update.mockResolvedValue(undefined);
    mockDb.outbox.toArray.mockResolvedValue([
      { id: "op-1", entityId: "product-1", operationType: "delete", status: "pending" },
    ]);
    mockDb.outbox.delete.mockResolvedValue(undefined);

    await restoreProduct("product-1");

    expect(mockDb.products.update).toHaveBeenCalledWith("product-1", {
      deletedAt: null,
      updatedAt: now,
    });

    expect(mockDb.outbox.delete).toHaveBeenCalledWith("op-1");

    vi.useRealTimers();
  });
});
