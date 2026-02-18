import { beforeEach, describe, expect, it, vi } from "vitest";

type MockProduct = {
  id: string;
  tenantId: string;
  name: string;
  quantity: number;
  syncStatus: "pending" | "synced" | "failed";
  updatedAt: string;
};

type MockMovement = {
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

type MockOutbox = {
  id: string;
  operationId: string;
  operationType: "create" | "update" | "delete";
  entityType: "product" | "stockMovement";
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
  const movements = new Map<string, MockMovement>();
  const outbox = new Map<string, MockOutbox>();

  return {
    products,
    movements,
    outbox,
    reset() {
      products.clear();
      movements.clear();
      outbox.clear();
    },
  };
});

vi.mock("~/features/offline/database", () => {
  const stockMovementWhere = (field: "productId" | "tenantId" | "[tenantId+syncStatus]") => ({
    equals(value: unknown) {
      if (field === "[tenantId+syncStatus]") {
        const [tenantId, syncStatus] = value as [string, MockMovement["syncStatus"]];
        const filtered = Array.from(state.movements.values()).filter(
          (item) => item.tenantId === tenantId && item.syncStatus === syncStatus
        );
        return {
          count: async () => filtered.length,
        };
      }

      const filtered = Array.from(state.movements.values()).filter((item) => {
        if (field === "productId") {
          return item.productId === value;
        }
        return item.tenantId === value;
      });

      return {
        toArray: async () => filtered,
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
        get: async (id: string) => state.products.get(id),
        put: async (product: MockProduct) => {
          state.products.set(product.id, product);
        },
        update: async (id: string, patch: Partial<MockProduct>) => {
          const current = state.products.get(id);
          if (!current) {
            return;
          }
          state.products.set(id, {
            ...current,
            ...patch,
          });
        },
      },
      stockMovements: {
        add: async (movement: MockMovement) => {
          state.movements.set(movement.id, movement);
        },
        get: async (id: string) => state.movements.get(id),
        update: async (id: string, patch: Partial<MockMovement>) => {
          const current = state.movements.get(id);
          if (!current) {
            return;
          }
          state.movements.set(id, {
            ...current,
            ...patch,
          });
        },
        where: stockMovementWhere,
      },
      outbox: {},
    },
  };
});

vi.mock("~/features/offline/outbox", () => ({
  enqueueOperation: async (input: {
    operationId?: string;
    operationType: "create" | "update" | "delete";
    entityType: "product" | "stockMovement";
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
  getPendingOperations: async () =>
    Array.from(state.outbox.values()).filter(
      (operation) => operation.status === "pending" || operation.status === "failed"
    ),
  markOperationProcessing: async (operationId: string) => {
    const operation = state.outbox.get(operationId);
    if (!operation) return;
    state.outbox.set(operationId, {
      ...operation,
      status: "processing",
    });
  },
  markOperationCompleted: async (operationId: string, serverSyncedId?: string) => {
    const operation = state.outbox.get(operationId);
    if (!operation) return;
    state.outbox.set(operationId, {
      ...operation,
      status: "completed",
      payload: {
        ...operation.payload,
        ...(serverSyncedId ? { serverId: serverSyncedId } : {}),
      },
      processedAt: new Date().toISOString(),
    });
  },
  markOperationFailed: async (operationId: string, error: string) => {
    const operation = state.outbox.get(operationId);
    if (!operation) return;
    state.outbox.set(operationId, {
      ...operation,
      status: "failed",
      retryCount: operation.retryCount + 1,
      error,
    });
  },
}));

import {
  createMovement,
  getMovementsByProduct,
  getPendingMovementSyncItems,
  getRecentProductIds,
  markMovementSynced,
  markMovementSyncFailed,
  markMovementSyncing,
} from "~/features/offline/movement-operations";

const TENANT_ID = "00000000-0000-0000-0000-000000000010";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000011";

describe("E2E - Inventory movement offline + sync", () => {
  beforeEach(() => {
    state.reset();
    state.products.set(PRODUCT_ID, {
      id: PRODUCT_ID,
      tenantId: TENANT_ID,
      name: "Flour",
      quantity: 10,
      syncStatus: "synced",
      updatedAt: new Date().toISOString(),
    });
  });

  it("records movement locally and updates local stock immediately", async () => {
    const { movementId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 5,
    });

    const movement = state.movements.get(movementId);
    expect(movement).toBeDefined();
    expect(movement?.syncStatus).toBe("pending");

    const product = state.products.get(PRODUCT_ID);
    expect(product?.quantity).toBe(15);
    expect(product?.syncStatus).toBe("pending");

    const pendingOps = Array.from(state.outbox.values()).filter(
      (operation) => operation.status === "pending"
    );
    expect(pendingOps).toHaveLength(1);
    expect(pendingOps[0]?.entityType).toBe("stockMovement");
  });

  it("returns pending movement sync items and marks movement as synced", async () => {
    const { movementId, operationId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "exit",
      quantity: 3,
    });

    const pending = await getPendingMovementSyncItems(TENANT_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.movementId).toBe(movementId);

    await markMovementSynced({
      movementId,
      operationId,
      serverMovementId: "server-movement-1",
    });

    expect(state.movements.get(movementId)?.syncStatus).toBe("synced");
    expect(state.outbox.get(operationId)?.status).toBe("completed");
  });

  it("builds recent product shortcuts from movement history", async () => {
    const product2 = "00000000-0000-0000-0000-000000000012";
    state.products.set(product2, {
      id: product2,
      tenantId: TENANT_ID,
      name: "Sugar",
      quantity: 7,
      syncStatus: "synced",
      updatedAt: new Date().toISOString(),
    });

    await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 1,
    });
    await createMovement({
      tenantId: TENANT_ID,
      productId: product2,
      type: "entry",
      quantity: 1,
    });
    await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "exit",
      quantity: 1,
    });

    const recentProductIds = await getRecentProductIds(TENANT_ID, 5);
    expect(recentProductIds).toEqual([PRODUCT_ID, product2]);
  });
});

describe("E2E - Movement history offline visibility", () => {
  beforeEach(() => {
    state.reset();
    state.products.set(PRODUCT_ID, {
      id: PRODUCT_ID,
      tenantId: TENANT_ID,
      name: "Flour",
      quantity: 10,
      syncStatus: "synced",
      updatedAt: new Date().toISOString(),
    });
  });

  it("shows locally created movement immediately in history", async () => {
    const { movementId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 5,
    });

    const movement = state.movements.get(movementId);
    expect(movement).toBeDefined();
    expect(movement?.syncStatus).toBe("pending");
    expect(movement?.type).toBe("entry");
    expect(movement?.quantity).toBe(5);
  });

  it("displays pending-sync badge for offline movements", async () => {
    const { movementId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "exit",
      quantity: 2,
    });

    const movement = state.movements.get(movementId);
    expect(movement?.syncStatus).toBe("pending");

    await markMovementSynced({
      movementId,
      operationId: movement?.idempotencyKey ?? "",
    });

    expect(state.movements.get(movementId)?.syncStatus).toBe("synced");
  });

  it("shows failed sync status for movements that failed to sync", async () => {
    const { movementId, operationId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 3,
    });

    const operation = state.outbox.get(operationId);
    expect(operation?.status).toBe("pending");

    state.outbox.set(operationId, {
      ...operation!,
      status: "failed",
      error: "Network error",
    });

    state.movements.set(movementId, {
      ...state.movements.get(movementId)!,
      syncStatus: "failed",
    });

    const failedMovement = state.movements.get(movementId);
    expect(failedMovement?.syncStatus).toBe("failed");
  });

  it("filters local movement history by tenant and product", async () => {
    const now = new Date().toISOString();

    state.movements.set("foreign-movement", {
      id: "foreign-movement",
      tenantId: "00000000-0000-0000-0000-000000000099",
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 999,
      idempotencyKey: "foreign-operation",
      clientCreatedAt: now,
      serverCreatedAt: null,
      syncedAt: null,
      syncStatus: "pending",
    });

    const { movementId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 3,
    });

    const history = await getMovementsByProduct({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
    });

    expect(history.some((movement) => movement.id === "foreign-movement")).toBe(false);
    expect(history.some((movement) => movement.id === movementId)).toBe(true);
  });

  it("maintains newest-first order for movements", async () => {
    await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "exit",
      quantity: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 2,
    });

    const movements = Array.from(state.movements.values()).sort(
      (a, b) => new Date(b.clientCreatedAt).getTime() - new Date(a.clientCreatedAt).getTime()
    );

    expect(movements[0]?.quantity).toBe(2);
    expect(movements[0]?.type).toBe("entry");
    expect(movements[1]?.quantity).toBe(1);
    expect(movements[1]?.type).toBe("exit");
    expect(movements[2]?.quantity).toBe(1);
    expect(movements[2]?.type).toBe("entry");
  });

  it("transitions movement status through sync lifecycle", async () => {
    const { movementId, operationId } = await createMovement({
      tenantId: TENANT_ID,
      productId: PRODUCT_ID,
      type: "entry",
      quantity: 10,
    });

    expect(state.movements.get(movementId)?.syncStatus).toBe("pending");

    const pendingItemsBeforeProcessing = await getPendingMovementSyncItems(TENANT_ID);
    expect(pendingItemsBeforeProcessing).toHaveLength(1);
    expect(pendingItemsBeforeProcessing[0]?.movementId).toBe(movementId);

    await markMovementSyncing({
      movementId,
      operationId,
    });

    expect(state.movements.get(movementId)?.syncStatus).toBe("processing");
    expect(state.outbox.get(operationId)?.status).toBe("processing");

    await markMovementSynced({
      movementId,
      operationId,
    });

    expect(state.movements.get(movementId)?.syncStatus).toBe("synced");
    expect(state.outbox.get(operationId)?.status).toBe("completed");
  });
});
