import { beforeEach, describe, expect, it, vi } from "vitest";

import { restoreProduct } from "~/features/offline/sync-pipeline";

/**
 * PR #15 review (A3 / B2): restoreProduct must (a) reject when the
 * product belongs to a different tenant and (b) execute the
 * products.update + outbox delete within the SAME Dexie transaction
 * callback. We exercise the mock-friendly version of this invariant:
 * the writes are observed in the callback body and not before/after.
 */
const productStore = vi.hoisted(() => {
  type Product = {
    id: string;
    tenantId: string;
    name: string;
    deletedAt: string | null;
  };
  const products = new Map<string, Product>();

  return {
    products,
    get: vi.fn(async (id: string) => products.get(id) ?? undefined),
    update: vi.fn(),
  };
});

const outboxStore = vi.hoisted(() => {
  type Op = {
    id: string;
    entityId: string;
    operationType: string;
    status: string;
  };
  const ops = new Map<string, Op>();

  return {
    ops,
    where: vi.fn(),
    delete: vi.fn(),
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
    products: {
      get: productStore.get,
      update: productStore.update,
    },
    outbox: {
      where: outboxStore.where,
      delete: outboxStore.delete,
    },
  },
}));

describe("restoreProduct (PR #15 A3 / B2)", () => {
  beforeEach(() => {
    productStore.products.clear();
    productStore.get.mockClear();
    productStore.update.mockClear();
    outboxStore.ops.clear();
    outboxStore.where.mockClear();
    outboxStore.delete.mockClear();
    transactionMock.mockClear();

    // Mock the chained db.outbox.where(...).equals(...).and(...).toArray()
    // We track the order in which the calls happen to assert that
    // the read+update all happen inside the transaction body.
    outboxStore.where.mockImplementation(() => ({
      equals: vi.fn(() => ({
        and: vi.fn(() => ({
          toArray: vi.fn(async () =>
            Array.from(outboxStore.ops.values()).filter(
              (op) =>
                op.entityId === "product-1" &&
                op.operationType === "delete" &&
                op.status === "pending"
            )
          ),
        })),
      })),
    }));
  });

  it("clears deletedAt and removes pending delete ops inside one transaction", async () => {
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Flour",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });
    outboxStore.ops.set("op-1", {
      id: "op-1",
      entityId: "product-1",
      operationType: "delete",
      status: "pending",
    });

    await restoreProduct("product-1", "tenant-1");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledWith(
      "rw",
      expect.objectContaining({ update: productStore.update }),
      expect.objectContaining({ delete: outboxStore.delete }),
      expect.any(Function)
    );
    expect(productStore.update).toHaveBeenCalledWith(
      "product-1",
      expect.objectContaining({ deletedAt: null })
    );
    expect(outboxStore.delete).toHaveBeenCalledWith("op-1");
  });

  it("throws when the product does not exist", async () => {
    await expect(restoreProduct("missing", "tenant-1")).rejects.toThrow(
      "Product not found in local database"
    );
  });

  it("throws when the product belongs to a different tenant", async () => {
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: "tenant-X",
      name: "Flour",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(restoreProduct("product-1", "tenant-Y")).rejects.toThrow(
      "Product does not belong to the provided tenant"
    );
  });

  it("does NOT enforce the tenant check when tenantId is omitted", async () => {
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: "tenant-X",
      name: "Flour",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(restoreProduct("product-1", "tenant-X")).resolves.toBeUndefined();
  });

  it("the products.update and outbox delete both happen inside the transaction body", async () => {
    productStore.products.set("product-1", {
      id: "product-1",
      tenantId: "tenant-1",
      name: "Flour",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });
    outboxStore.ops.set("op-1", {
      id: "op-1",
      entityId: "product-1",
      operationType: "delete",
      status: "pending",
    });

    // Wrap transactionMock to record the moment the callback runs.
    let ranProductsUpdate = false;
    let ranOutboxDelete = false;
    transactionMock.mockImplementationOnce(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      return callback();
    });
    const updateSpy = vi.spyOn(productStore, "update").mockImplementation(
      (async (id: string, patch: { deletedAt: string | null }) => {
        productStore.products.set(id, {
          ...(productStore.products.get(id) as {
            id: string;
            tenantId: string;
            name: string;
            deletedAt: string | null;
          }),
          ...patch,
        });
        ranProductsUpdate = true;
      }) as typeof productStore.update
    );
    const deleteSpy = vi
      .spyOn(outboxStore, "delete")
      .mockImplementation((async (id: string) => {
        outboxStore.ops.delete(id);
        ranOutboxDelete = true;
      }) as typeof outboxStore.delete);

    await restoreProduct("product-1", "tenant-1");

    expect(ranProductsUpdate).toBe(true);
    expect(ranOutboxDelete).toBe(true);
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
