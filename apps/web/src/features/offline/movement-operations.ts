import { db } from "./database";
import {
  enqueueOperation,
  getPendingOperations,
  markOperationCompleted,
  markOperationFailed,
  markOperationProcessing,
} from "./outbox";
import type { StockMovementInput } from "~/schemas/stock-movements";

export interface CreateMovementInput extends StockMovementInput {
  tenantId: string;
  productSnapshot?: {
    name: string;
    description?: string | null;
    sku?: string | null;
    category?: string | null;
    unit?: string | null;
    barcode?: string | null;
    price: number;
    purchasePrice?: number | null;
    quantity?: number;
    lowStockThreshold?: number | null;
  };
}

export async function createMovement(
  input: CreateMovementInput
): Promise<{ movementId: string; operationId: string }> {
  const movementId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const now = new Date().toISOString();

  let product = await db.products.get(input.productId);

  if (!product) {
    if (!input.productSnapshot) {
      throw new Error("Product not found for this tenant");
    }

    product = {
      id: input.productId,
      tenantId: input.tenantId,
      name: input.productSnapshot.name,
      description: input.productSnapshot.description ?? null,
      sku: input.productSnapshot.sku ?? null,
      category: input.productSnapshot.category ?? null,
      unit: input.productSnapshot.unit ?? null,
      barcode: input.productSnapshot.barcode ?? null,
      price: input.productSnapshot.price,
      purchasePrice: input.productSnapshot.purchasePrice ?? null,
      quantity: input.productSnapshot.quantity ?? 0,
      lowStockThreshold: input.productSnapshot.lowStockThreshold ?? null,
      syncStatus: "synced" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  if (product.tenantId !== input.tenantId) {
    throw new Error("Product not found for this tenant");
  }

  const quantityDelta = input.type === "entry" ? input.quantity : -input.quantity;
  const nextQuantity = product.quantity + quantityDelta;

  // Create the movement record
  const movement = {
    id: movementId,
    tenantId: input.tenantId,
    productId: input.productId,
    type: input.type,
    quantity: input.quantity,
    idempotencyKey: operationId,
    clientCreatedAt: now,
    serverCreatedAt: null,
    syncedAt: null,
    syncStatus: "pending" as const,
  };

  // Use a transaction to ensure both operations succeed or fail together
  await db.transaction("rw", db.stockMovements, db.products, db.outbox, async () => {
    // Ensure local product exists
    await db.products.put(product);

    // Save movement locally
    await db.stockMovements.add(movement);

    // Update local stock immediately to reflect movement in product listings/details
    await db.products.update(product.id, {
      quantity: nextQuantity,
      syncStatus: "pending",
      updatedAt: now,
    });

    // Queue for sync
    await enqueueOperation({
      operationId,
      operationType: "create",
      entityType: "stockMovement",
      entityId: movementId,
      payload: {
        tenantId: input.tenantId,
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        idempotencyKey: operationId,
        clientCreatedAt: now,
      },
    });
  });

  return { movementId, operationId };
}

export async function getMovementsByProduct(
  productId: string
): Promise<{
  id: string;
  type: "entry" | "exit";
  quantity: number;
  clientCreatedAt: string;
  syncStatus: "pending" | "synced" | "failed";
}[]> {
  const movements = await db.stockMovements.where("productId").equals(productId).toArray();

  movements.sort((a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt));

  return movements.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    clientCreatedAt: m.clientCreatedAt,
    syncStatus: m.syncStatus,
  }));
}

export async function getRecentMovements(
  tenantId: string,
  limit: number = 5
): Promise<{
  id: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  clientCreatedAt: string;
}[]> {
  const movements = await db.stockMovements.where("tenantId").equals(tenantId).toArray();

  movements.sort((a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt));

  return movements.slice(0, limit).map((m) => ({
    id: m.id,
    productId: m.productId,
    type: m.type,
    quantity: m.quantity,
    clientCreatedAt: m.clientCreatedAt,
  }));
}

export async function calculateLocalStock(productId: string): Promise<number> {
  const movements = await db.stockMovements.where("productId").equals(productId).toArray();

  return movements.reduce((total, movement) => {
    if (movement.type === "entry") {
      return total + movement.quantity;
    } else {
      return total - movement.quantity;
    }
  }, 0);
}

export async function getPendingMovementCount(tenantId: string): Promise<number> {
  return await db.stockMovements
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .count();
}

export async function getRecentProductIds(tenantId: string, limit = 5): Promise<string[]> {
  const movements = await db.stockMovements.where("tenantId").equals(tenantId).toArray();
  movements.sort((a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt));

  const productIds: string[] = [];
  const seen = new Set<string>();

  for (const movement of movements) {
    if (seen.has(movement.productId)) {
      continue;
    }

    seen.add(movement.productId);
    productIds.push(movement.productId);

    if (productIds.length >= limit) {
      break;
    }
  }

  return productIds;
}

export interface PendingMovementSyncItem {
  operationId: string;
  movementId: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  idempotencyKey: string;
}

export async function getPendingMovementSyncItems(
  tenantId: string
): Promise<PendingMovementSyncItem[]> {
  const operations = await getPendingOperations();
  const items: PendingMovementSyncItem[] = [];

  for (const operation of operations) {
    if (operation.entityType !== "stockMovement") {
      continue;
    }

    const payloadTenantId = (operation.payload as { tenantId?: unknown }).tenantId;
    if (payloadTenantId !== tenantId) {
      continue;
    }

    const movement = await db.stockMovements.get(operation.entityId);
    if (!movement || movement.syncStatus === "synced") {
      continue;
    }

    items.push({
      operationId: operation.operationId,
      movementId: movement.id,
      productId: movement.productId,
      type: movement.type,
      quantity: movement.quantity,
      idempotencyKey: movement.idempotencyKey,
    });
  }

  return items;
}

export async function markMovementSyncing(operationId: string): Promise<void> {
  await markOperationProcessing(operationId);
}

export async function markMovementSynced(input: {
  movementId: string;
  operationId: string;
  serverMovementId?: string;
}): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction("rw", db.stockMovements, db.outbox, async () => {
    await db.stockMovements.update(input.movementId, {
      syncStatus: "synced",
      syncedAt: now,
      serverCreatedAt: now,
    });
    await markOperationCompleted(input.operationId, input.serverMovementId);
  });
}

export async function markMovementSyncFailed(input: {
  movementId: string;
  operationId: string;
  error: string;
}): Promise<void> {
  await db.transaction("rw", db.stockMovements, db.outbox, async () => {
    await db.stockMovements.update(input.movementId, {
      syncStatus: "failed",
    });
    await markOperationFailed(input.operationId, input.error);
  });
}
