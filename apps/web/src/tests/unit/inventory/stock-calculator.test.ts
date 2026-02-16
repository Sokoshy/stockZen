import { describe, it, expect, beforeEach, vi } from "vitest";

const { toArrayMock } = vi.hoisted(() => ({
  toArrayMock: vi.fn(),
}));

vi.mock("~/features/offline/database", () => ({
  db: {
    stockMovements: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: toArrayMock,
        })),
      })),
    },
  },
}));

import { calculateLocalStock } from "~/features/offline/movement-operations";

describe("calculateLocalStock", () => {
  const productId = "prod-456";

  beforeEach(() => {
    toArrayMock.mockReset();
  });

  it("should return 0 for product with no movements", async () => {
    toArrayMock.mockResolvedValue([]);
    const stock = await calculateLocalStock(productId);
    expect(stock).toBe(0);
  });

  it("should calculate stock from entry movements", async () => {
    toArrayMock.mockResolvedValue([
      {
        id: "mov-1",
        tenantId: "tenant-123",
        productId,
        type: "entry",
        quantity: 10,
      },
    ]);

    const stock = await calculateLocalStock(productId);
    expect(stock).toBe(10);
  });

  it("should calculate stock from exit movements", async () => {
    toArrayMock.mockResolvedValue([
      {
        id: "mov-1",
        tenantId: "tenant-123",
        productId,
        type: "entry",
        quantity: 20,
      },
      {
        id: "mov-2",
        tenantId: "tenant-123",
        productId,
        type: "exit",
        quantity: 5,
      },
    ]);

    const stock = await calculateLocalStock(productId);
    expect(stock).toBe(15);
  });

  it("should handle multiple entries and exits", async () => {
    toArrayMock.mockResolvedValue([
      {
        id: "mov-1",
        tenantId: "tenant-123",
        productId,
        type: "entry",
        quantity: 50,
      },
      {
        id: "mov-2",
        tenantId: "tenant-123",
        productId,
        type: "exit",
        quantity: 20,
      },
      {
        id: "mov-3",
        tenantId: "tenant-123",
        productId,
        type: "entry",
        quantity: 30,
      },
      {
        id: "mov-4",
        tenantId: "tenant-123",
        productId,
        type: "exit",
        quantity: 15,
      },
    ]);

    const stock = await calculateLocalStock(productId);
    expect(stock).toBe(45); // 50 - 20 + 30 - 15
  });

  it("should isolate calculations by productId", async () => {
    const productId2 = "prod-789";

    toArrayMock
      .mockResolvedValueOnce([
        {
          id: "mov-1",
          tenantId: "tenant-123",
          productId,
          type: "entry",
          quantity: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "mov-2",
          tenantId: "tenant-123",
          productId: productId2,
          type: "entry",
          quantity: 25,
        },
      ]);

    const stock1 = await calculateLocalStock(productId);
    const stock2 = await calculateLocalStock(productId2);

    expect(stock1).toBe(10);
    expect(stock2).toBe(25);
  });
});
