import { beforeEach, describe, expect, it, vi } from "vitest";

const { addProductMock, enqueueOperationMock } = vi.hoisted(() => ({
  addProductMock: vi.fn(),
  enqueueOperationMock: vi.fn(),
}));

vi.mock("~/features/offline/database", () => ({
  db: {
    products: {
      add: addProductMock,
    },
  },
}));

vi.mock("~/features/offline/outbox", () => ({
  enqueueOperation: enqueueOperationMock,
}));

import { createProductOffline } from "~/features/offline/product-operations";

describe("createProductOffline", () => {
  beforeEach(() => {
    addProductMock.mockReset();
    enqueueOperationMock.mockReset();
  });

  it("creates a local pending product and enqueues idempotent outbox payload", async () => {
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("local-product-id")
      .mockReturnValueOnce("operation-id-001");

    enqueueOperationMock.mockResolvedValue("operation-id-001");

    const result = await createProductOffline({
      tenantId: "tenant-1",
      name: "Flour",
      category: "Baking",
      unit: "kg",
      barcode: "123456",
      price: 12.5,
      purchasePrice: 8,
      quantity: 3,
    });

    expect(addProductMock).toHaveBeenCalledTimes(1);
    expect(addProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "local-product-id",
        tenantId: "tenant-1",
        name: "Flour",
        category: "Baking",
        unit: "kg",
        barcode: "123456",
        price: 12.5,
        purchasePrice: 8,
        quantity: 3,
        syncStatus: "pending",
      })
    );

    expect(enqueueOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "operation-id-001",
        operationType: "create",
        entityType: "product",
        entityId: "local-product-id",
        payload: expect.objectContaining({
          operationId: "operation-id-001",
          name: "Flour",
          category: "Baking",
          unit: "kg",
        }),
      })
    );

    expect(result.id).toBe("local-product-id");
    expect(result.syncStatus).toBe("pending");

    randomUuidSpy.mockRestore();
  });
});
