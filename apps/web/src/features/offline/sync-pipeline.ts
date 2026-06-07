import { db, type OutboxOperation, type LocalProduct } from "./database";
import type { StockMovementInput } from "~/schemas/stock-movements";
import type { SyncRequest, SyncResponse, SyncResult } from "~/schemas/sync";

// ──────────────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────────────

export interface EnqueueOperationInput {
  operationId?: string;
  operationType: "create" | "update" | "delete";
  entityType: "product" | "stockMovement";
  entityId: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

export interface CreateProductOfflineInput {
  tenantId: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  category: string;
  unit: string;
  barcode?: string | null;
  price: number;
  purchasePrice?: number | null;
  quantity?: number;
  lowStockThreshold?: number | null;
  thresholdMode?: "defaults" | "custom";
  customCriticalThreshold?: number | null;
  customAttentionThreshold?: number | null;
}

export interface UpdateProductOfflineInput {
  id: string;
  tenantId: string;
  name?: string;
  description?: string | null;
  sku?: string | null;
  category?: string;
  unit?: string;
  barcode?: string | null;
  price?: number;
  purchasePrice?: number | null;
  lowStockThreshold?: number | null;
  thresholdMode?: "defaults" | "custom";
  customCriticalThreshold?: number | null;
  customAttentionThreshold?: number | null;
}

export interface DeleteProductOfflineInput {
  id: string;
  tenantId: string;
  originalProductName: string;
}

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

export interface PendingMovementSyncItem {
  operationId: string;
  movementId: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  idempotencyKey: string;
}

export type SyncState = "offline" | "syncing" | "upToDate" | "error";

export interface SyncEngineConfig {
  tenantId: string;
  syncEndpoint?: string;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  syncIntervalMs?: number;
}

export interface SyncEngineState {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

type SyncStateListener = (state: SyncEngineState) => void;

// ──────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60000;
const DEFAULT_SYNC_INTERVAL_MS = 30000;

// ──────────────────────────────────────────────────────
// Outbox Operations
// ──────────────────────────────────────────────────────

export async function enqueueOperation(input: EnqueueOperationInput): Promise<string> {
  const operationId = input.operationId ?? crypto.randomUUID();
  const now = new Date().toISOString();

  const operation: OutboxOperation = {
    id: operationId,
    operationId,
    operationType: input.operationType,
    entityType: input.entityType,
    entityId: input.entityId,
    tenantId: input.tenantId,
    payload: {
      ...input.payload,
      tenantId: input.tenantId,
      operationId,
    },
    status: "pending",
    retryCount: 0,
    createdAt: now,
    processedAt: null,
    error: null,
  };

  await db.outbox.add(operation);
  return operationId;
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  const all = await db.outbox.toArray();
  return all.filter((op) => op.status === "pending" || op.status === "failed");
}

/**
 * Atomically claim pending operations by marking them as "processing" in a
 * single Dexie transaction. This prevents multi-tab double-processing.
 *
 * Uses the indexed [tenantId+status] composite for an efficient query path
 * when both fields are present, and falls back to a full table scan for
 * legacy rows missing tenantId (pre-v6 schema).
 */
export async function claimPendingOperations(
  tenantId: string,
  maxRetries: number,
  baseRetryDelayMs: number,
  maxRetryDelayMs: number
): Promise<OutboxOperation[]> {
  return db.transaction("rw", db.outbox, async () => {
    const now = Date.now();

    // Prefer the indexed composite query. When rows for this tenant exist
    // with a tenantId column we can hit the [tenantId+status] index; we
    // still need to merge legacy rows that lack a top-level tenantId
    // (their payload-level tenantId is the source of truth until v6
    // backfill runs).
    const indexedPending = await db.outbox
      .where("[tenantId+status]")
      .equals([tenantId, "pending"])
      .toArray();
    const indexedFailed = await db.outbox
      .where("[tenantId+status]")
      .equals([tenantId, "failed"])
      .toArray();

    const legacyAll = await db.outbox.toArray();
    const legacyRows = legacyAll.filter(
      (op) => !op.tenantId && (op.payload as { tenantId?: string }).tenantId === tenantId
    );

    const candidates: OutboxOperation[] = [
      ...indexedPending,
      ...indexedFailed,
      ...legacyRows,
    ];

    const claimable = candidates.filter((op) => {
      if (op.status !== "pending" && op.status !== "failed") {
        return false;
      }

      const opTenantId = op.tenantId ?? (op.payload as { tenantId?: string }).tenantId;
      if (opTenantId !== tenantId) {
        return false;
      }

      if (op.status === "failed") {
        if (op.retryCount >= maxRetries) {
          return false;
        }

        if (!op.processedAt) {
          return true;
        }

        const lastAttemptAt = Date.parse(op.processedAt);
        if (Number.isNaN(lastAttemptAt)) {
          return true;
        }

        const retryDelay = calculateRetryDelay(
          baseRetryDelayMs,
          maxRetryDelayMs,
          Math.max(0, op.retryCount - 1)
        );
        return now >= lastAttemptAt + retryDelay;
      }

      return true;
    });

    for (const op of claimable) {
      await db.outbox.update(op.id, { status: "processing" });
    }

    return claimable;
  });
}

export async function markOperationProcessing(operationId: string): Promise<void> {
  await db.outbox.update(operationId, {
    status: "processing",
  });
}

/**
 * Mark an operation as completed in a single Dexie transaction. When a
 * server-side id is provided it is merged into the payload so the next
 * observer can use it.
 *
 * When serverSyncedId is provided: one read + one write inside a single transaction.
 * When absent: a single write (no read).
 *
 * The `oneShotRetry` transient flag is explicitly cleared (set to
 * `undefined`) so Dexie's `update` removes the key — a successful
 * retry must not keep the flag around for the next attempt.
 */
export async function markOperationCompleted(
  operationId: string,
  serverSyncedId?: string
): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    if (serverSyncedId) {
      const existing = await db.outbox.get(operationId);
      await db.outbox.update(operationId, {
        status: "completed",
        processedAt: new Date().toISOString(),
        oneShotRetry: undefined,
        payload: { ...(existing?.payload ?? {}), serverId: serverSyncedId },
      });
    } else {
      await db.outbox.update(operationId, {
        status: "completed",
        processedAt: new Date().toISOString(),
        oneShotRetry: undefined,
      });
    }
  });
}

/**
 * Mark an operation as failed. When nextRetryCount >= maxRetries, sets
 * status to "permanently_failed" (terminal state) instead of "failed".
 *
 * `maxRetries` is REQUIRED at compile time: passing it incorrectly used
 * to silently disable the terminal-state check, which is exactly the
 * regression that prompted this constraint. See PR #15 review (A1).
 */
export async function markOperationFailed(
  operationId: string,
  error: string,
  maxRetries: number
): Promise<void> {
  const operation = await db.outbox.get(operationId);
  if (!operation) return;

  const nextRetryCount = operation.retryCount + 1;
  const isTerminal = nextRetryCount >= maxRetries;

  await db.outbox.update(operationId, {
    status: isTerminal ? "permanently_failed" : "failed",
    retryCount: nextRetryCount,
    error,
    processedAt: new Date().toISOString(),
  });
}

// ──────────────────────────────────────────────────────
// Product Operations
// ──────────────────────────────────────────────────────

export async function createProductOffline(
  input: CreateProductOfflineInput
): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const localId = crypto.randomUUID();
  const operationId = crypto.randomUUID();

  const thresholdMode = input.thresholdMode ?? "defaults";
  const customCriticalThreshold =
    thresholdMode === "custom" ? input.customCriticalThreshold ?? null : null;
  const customAttentionThreshold =
    thresholdMode === "custom" ? input.customAttentionThreshold ?? null : null;

  const localProduct: LocalProduct = {
    id: localId,
    tenantId: input.tenantId,
    name: input.name,
    description: input.description ?? null,
    sku: input.sku ?? null,
    category: input.category,
    unit: input.unit,
    barcode: input.barcode ?? null,
    price: input.price,
    purchasePrice: input.purchasePrice ?? null,
    quantity: input.quantity ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? null,
    customCriticalThreshold,
    customAttentionThreshold,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.add(localProduct);

    await enqueueOperation({
      operationId,
      operationType: "create",
      entityType: "product",
      entityId: localId,
      tenantId: input.tenantId,
      payload: {
        operationId,
        tenantId: input.tenantId,
        clientUpdatedAt: now,
        name: input.name,
        description: input.description,
        sku: input.sku,
        category: input.category,
        unit: input.unit,
        barcode: input.barcode,
        price: input.price,
        purchasePrice: input.purchasePrice,
        quantity: input.quantity ?? 0,
        lowStockThreshold: input.lowStockThreshold,
        thresholdMode,
        customCriticalThreshold,
        customAttentionThreshold,
      },
    });
  });

  return localProduct;
}

export async function getLocalProducts(tenantId: string): Promise<LocalProduct[]> {
  return db.products
    .where("tenantId")
    .equals(tenantId)
    .and((p) => !p.deletedAt)
    .toArray();
}

export async function getAllLocalProducts(
  tenantId: string
): Promise<LocalProduct[]> {
  return db.products.where("tenantId").equals(tenantId).toArray();
}

export async function getLocalProductById(
  productId: string,
  tenantId: string
): Promise<LocalProduct | undefined> {
  return db.products
    .where("id")
    .equals(productId)
    .and((p) => p.tenantId === tenantId)
    .first();
}

export async function getPendingSyncProducts(
  tenantId: string
): Promise<LocalProduct[]> {
  return db.products
    .where("tenantId")
    .equals(tenantId)
    .and((p) => p.syncStatus === "pending")
    .toArray();
}

export async function updateProductSyncStatus(
  productId: string,
  status: "pending" | "synced" | "failed"
): Promise<void> {
  await db.products.update(productId, {
    syncStatus: status,
    updatedAt: new Date().toISOString(),
  });
}

export async function applyServerProductState(
  productId: string,
  serverState?: Record<string, unknown>
): Promise<void> {
  if (!serverState) {
    return;
  }

  const existing = await db.products.get(productId);
  if (!existing) {
    return;
  }

  await db.products.update(productId, {
    name: typeof serverState.name === "string" ? serverState.name : existing.name,
    description:
      serverState.description !== undefined
        ? (serverState.description as string | null)
        : existing.description,
    sku:
      serverState.sku !== undefined
        ? (serverState.sku as string | null)
        : existing.sku,
    category:
      serverState.category !== undefined
        ? (serverState.category as string | null)
        : existing.category,
    unit:
      serverState.unit !== undefined
        ? (serverState.unit as string | null)
        : existing.unit,
    barcode:
      serverState.barcode !== undefined
        ? (serverState.barcode as string | null)
        : existing.barcode,
    price:
      typeof serverState.price === "number"
        ? serverState.price
        : existing.price,
    purchasePrice:
      serverState.purchasePrice !== undefined
        ? (serverState.purchasePrice as number | null)
        : existing.purchasePrice,
    quantity:
      typeof serverState.quantity === "number"
        ? serverState.quantity
        : existing.quantity,
    lowStockThreshold:
      serverState.lowStockThreshold !== undefined
        ? (serverState.lowStockThreshold as number | null)
        : existing.lowStockThreshold,
    customCriticalThreshold:
      serverState.customCriticalThreshold !== undefined
        ? (serverState.customCriticalThreshold as number | null)
        : existing.customCriticalThreshold,
    customAttentionThreshold:
      serverState.customAttentionThreshold !== undefined
        ? (serverState.customAttentionThreshold as number | null)
        : existing.customAttentionThreshold,
    deletedAt:
      serverState.deletedAt !== undefined
        ? (serverState.deletedAt as string | null)
        : existing.deletedAt,
    updatedAt:
      typeof serverState.updatedAt === "string"
        ? serverState.updatedAt
        : new Date().toISOString(),
    syncStatus: "synced",
  });
}

export async function updateProductOffline(
  input: UpdateProductOfflineInput
): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const operationId = crypto.randomUUID();

  const existingProduct = await db.products.get(input.id);
  if (!existingProduct) {
    throw new Error("Product not found in local database");
  }

  if (existingProduct.tenantId !== input.tenantId) {
    throw new Error("Product does not belong to the provided tenant");
  }

  const thresholdMode = input.thresholdMode ?? "defaults";
  const customCriticalThreshold =
    thresholdMode === "custom" ? input.customCriticalThreshold ?? null : null;
  const customAttentionThreshold =
    thresholdMode === "custom" ? input.customAttentionThreshold ?? null : null;

  const updatedProduct: LocalProduct = {
    ...existingProduct,
    name: input.name ?? existingProduct.name,
    description:
      input.description !== undefined
        ? input.description
        : existingProduct.description,
    sku: input.sku !== undefined ? input.sku : existingProduct.sku,
    category: input.category ?? existingProduct.category,
    unit: input.unit ?? existingProduct.unit,
    barcode: input.barcode !== undefined ? input.barcode : existingProduct.barcode,
    price: input.price ?? existingProduct.price,
    purchasePrice:
      input.purchasePrice !== undefined
        ? input.purchasePrice
        : existingProduct.purchasePrice,
    lowStockThreshold:
      input.lowStockThreshold !== undefined
        ? input.lowStockThreshold
        : existingProduct.lowStockThreshold,
    customCriticalThreshold,
    customAttentionThreshold,
    syncStatus: "pending",
    updatedAt: now,
  };

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.put(updatedProduct);

    await enqueueOperation({
      operationId,
      operationType: "update",
      entityType: "product",
      entityId: input.id,
      tenantId: input.tenantId,
      payload: {
        operationId,
        tenantId: input.tenantId,
        clientUpdatedAt: now,
        originalProduct: {
          id: existingProduct.id,
          name: existingProduct.name,
          description: existingProduct.description,
          sku: existingProduct.sku,
          category: existingProduct.category,
          unit: existingProduct.unit,
          barcode: existingProduct.barcode,
          price: existingProduct.price,
          purchasePrice: existingProduct.purchasePrice,
          lowStockThreshold: existingProduct.lowStockThreshold,
          customCriticalThreshold: existingProduct.customCriticalThreshold,
          customAttentionThreshold: existingProduct.customAttentionThreshold,
        },
        updatedFields: {
          name: input.name,
          description: input.description,
          sku: input.sku,
          category: input.category,
          unit: input.unit,
          barcode: input.barcode,
          price: input.price,
          purchasePrice: input.purchasePrice,
          lowStockThreshold: input.lowStockThreshold,
          thresholdMode,
          customCriticalThreshold,
          customAttentionThreshold,
        },
      },
    });
  });

  return updatedProduct;
}

export async function deleteProductOffline(
  input: DeleteProductOfflineInput
): Promise<void> {
  const now = new Date().toISOString();
  const operationId = crypto.randomUUID();

  const existingProduct = await db.products.get(input.id);
  if (!existingProduct) {
    throw new Error("Product not found in local database");
  }

  if (existingProduct.tenantId !== input.tenantId) {
    throw new Error("Product does not belong to the provided tenant");
  }

  await db.transaction("rw", db.products, db.outbox, async () => {
    await db.products.update(input.id, {
      deletedAt: now,
      syncStatus: "pending",
      updatedAt: now,
    });

    await enqueueOperation({
      operationId,
      operationType: "delete",
      entityType: "product",
      entityId: input.id,
      tenantId: input.tenantId,
      payload: {
        operationId,
        tenantId: input.tenantId,
        clientUpdatedAt: now,
        productId: input.id,
        originalProductName: input.originalProductName,
      },
    });
  });
}

/**
 * Restore a soft-deleted product by clearing deletedAt and removing any
 * pending delete operations — all within a single Dexie transaction.
 *
 * Pass `tenantId` to enforce ownership. When provided, this throws if
 * the product belongs to a different tenant — important so the restore
 * action in the delete dialog cannot accidentally revive another tenant's
 * row.
 */
export async function restoreProduct(
  productId: string,
  tenantId?: string
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction("rw", db.products, db.outbox, async () => {
    const existingProduct = await db.products.get(productId);
    if (!existingProduct) {
      throw new Error("Product not found in local database");
    }

    if (tenantId !== undefined && existingProduct.tenantId !== tenantId) {
      throw new Error("Product does not belong to the provided tenant");
    }

    await db.products.update(productId, {
      deletedAt: null,
      updatedAt: now,
    });

    const pendingDeleteOps = await db.outbox
      .where("entityId")
      .equals(productId)
      .and((op) => op.operationType === "delete" && op.status === "pending")
      .toArray();

    for (const op of pendingDeleteOps) {
      await db.outbox.delete(op.id);
    }
  });
}

// ──────────────────────────────────────────────────────
// Movement Operations
// ──────────────────────────────────────────────────────

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
      customCriticalThreshold: null,
      customAttentionThreshold: null,
      syncStatus: "synced" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  if (!product) {
    throw new Error("Product not found for this tenant");
  }

  if (product.tenantId !== input.tenantId) {
    throw new Error("Product not found for this tenant");
  }

  const quantityDelta =
    input.type === "entry" ? input.quantity : -input.quantity;
  const nextQuantity = product.quantity + quantityDelta;

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

  await db.transaction(
    "rw",
    db.stockMovements,
    db.products,
    db.outbox,
    async () => {
      await db.products.put(product);

      await db.stockMovements.add(movement);

      await db.products.update(product.id, {
        quantity: nextQuantity,
        syncStatus: "pending",
        updatedAt: now,
      });

      await enqueueOperation({
        operationId,
        operationType: "create",
        entityType: "stockMovement",
        entityId: movementId,
        tenantId: input.tenantId,
        payload: {
          tenantId: input.tenantId,
          productId: input.productId,
          type: input.type,
          quantity: input.quantity,
          idempotencyKey: operationId,
          clientCreatedAt: now,
        },
      });
    }
  );

  return { movementId, operationId };
}

export async function getMovementsByProduct(input: {
  productId: string;
  tenantId: string;
}): Promise<
  {
    id: string;
    type: "entry" | "exit";
    quantity: number;
    clientCreatedAt: string;
    syncStatus: "pending" | "processing" | "synced" | "failed";
  }[]
> {
  const movements = await db.stockMovements
    .where("productId")
    .equals(input.productId)
    .toArray();

  const tenantMovements = movements.filter(
    (movement) => movement.tenantId === input.tenantId
  );

  tenantMovements.sort(
    (a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt)
  );

  return tenantMovements.map((m) => ({
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
): Promise<
  {
    id: string;
    productId: string;
    type: "entry" | "exit";
    quantity: number;
    clientCreatedAt: string;
  }[]
> {
  const movements = await db.stockMovements
    .where("tenantId")
    .equals(tenantId)
    .toArray();

  movements.sort(
    (a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt)
  );

  return movements.slice(0, limit).map((m) => ({
    id: m.id,
    productId: m.productId,
    type: m.type,
    quantity: m.quantity,
    clientCreatedAt: m.clientCreatedAt,
  }));
}

export async function calculateLocalStock(productId: string): Promise<number> {
  const movements = await db.stockMovements
    .where("productId")
    .equals(productId)
    .toArray();

  return movements.reduce((total, movement) => {
    if (movement.type === "entry") {
      return total + movement.quantity;
    } else {
      return total - movement.quantity;
    }
  }, 0);
}

export async function getPendingMovementCount(
  tenantId: string
): Promise<number> {
  return await db.stockMovements
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .count();
}

export async function getRecentProductIds(
  tenantId: string,
  limit = 5
): Promise<string[]> {
  const movements = await db.stockMovements
    .where("tenantId")
    .equals(tenantId)
    .toArray();
  movements.sort(
    (a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt)
  );

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

// ──────────────────────────────────────────────────────
// Permanently-Failed Queries & Retry Helpers
// ──────────────────────────────────────────────────────

/**
 * Look up all outbox rows in "permanently_failed" status for the given
 * tenant. Uses the indexed [tenantId+status] composite when rows have
 * a top-level tenantId (post-v6); falls back to a JS scan for legacy
 * rows where tenantId is only in the payload.
 */
export async function getPermanentlyFailedOperations(
  tenantId: string
): Promise<OutboxOperation[]> {
  let rows: OutboxOperation[] = [];
  try {
    rows = await db.outbox
      .where("[tenantId+status]")
      .equals([tenantId, "permanently_failed"])
      .toArray();
  } catch {
    rows = [];
  }

  const legacy = await db.outbox.toArray();
  const legacyMatching = legacy.filter(
    (op) =>
      op.status === "permanently_failed" &&
      !op.tenantId &&
      (op.payload as { tenantId?: string }).tenantId === tenantId
  );

  const byId = new Map<string, OutboxOperation>();
  for (const op of [...rows, ...legacyMatching]) {
    byId.set(op.id, op);
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export type RetryOutcome = "completed" | "deleted" | "noop";

export interface RetryPermanentlyFailedResult {
  outcome: RetryOutcome;
  operationId: string;
}

/**
 * Clean up the local entity (product or movement) associated with an
 * outbox operation when its sync has been abandoned. The goal is to
 * leave local state consistent with the server (which never received
 * the change):
 *
 * - product create: hard-delete the local row (it never existed on
 *   the server, so the user is back to a consistent state).
 * - product update: revert to the server-synced snapshot stored in
 *   the operation payload (`originalProduct`). If the snapshot is
 *   missing, hard-delete is the safe fallback.
 * - product delete: clear the local `syncStatus: pending_delete`
 *   marker so the product reappears as live (the server never
 *   confirmed the delete).
 * - stockMovement create: hard-delete the local movement row and
 *   recompute the product quantity by replaying only synced
 *   movements.
 *
 * This function is best-effort: it never throws. Errors are swallowed
 * and logged; the outbox row deletion still happens regardless.
 */
export async function cleanupLocalEntityForOp(
  op: OutboxOperation
): Promise<void> {
  try {
    if (op.entityType === "product") {
      if (op.operationType === "create") {
        await db.products.delete(op.entityId);
        return;
      }

      if (op.operationType === "delete") {
        const existing = await db.products.get(op.entityId);
        if (existing) {
          await db.products.update(op.entityId, {
            deletedAt: null,
            syncStatus: "synced",
            updatedAt: new Date().toISOString(),
          });
        }
        return;
      }

      // operationType === "update"
      const original = (op.payload as { originalProduct?: Partial<LocalProduct> })
        .originalProduct;
      const existing = await db.products.get(op.entityId);
      if (!existing) {
        return;
      }

      if (original && typeof original === "object") {
        const patch: Partial<LocalProduct> = {
          syncStatus: "synced",
          updatedAt: new Date().toISOString(),
        };
        if (typeof original.name === "string") patch.name = original.name;
        if (original.description !== undefined) {
          patch.description = (original.description as string | null) ?? null;
        }
        if (original.sku !== undefined) {
          patch.sku = (original.sku as string | null) ?? null;
        }
        if (typeof original.category === "string" || original.category === null) {
          patch.category = (original.category as string | null) ?? existing.category;
        }
        if (typeof original.unit === "string" || original.unit === null) {
          patch.unit = (original.unit as string | null) ?? existing.unit;
        }
        if (original.barcode !== undefined) {
          patch.barcode = (original.barcode as string | null) ?? null;
        }
        if (typeof original.price === "number") {
          patch.price = original.price;
        }
        if (original.purchasePrice !== undefined) {
          patch.purchasePrice = (original.purchasePrice as number | null) ?? null;
        }
        if (original.lowStockThreshold !== undefined) {
          patch.lowStockThreshold = (original.lowStockThreshold as number | null) ?? null;
        }
        if (original.customCriticalThreshold !== undefined) {
          patch.customCriticalThreshold =
            (original.customCriticalThreshold as number | null) ?? null;
        }
        if (original.customAttentionThreshold !== undefined) {
          patch.customAttentionThreshold =
            (original.customAttentionThreshold as number | null) ?? null;
        }
        await db.products.put({ ...existing, ...patch });
      } else {
        // No snapshot to revert to — bail to hard-delete to keep state consistent.
        await db.products.delete(op.entityId);
      }
      return;
    }

    if (op.entityType === "stockMovement") {
      if (op.operationType === "create") {
        await db.stockMovements.delete(op.entityId);
        // Recompute the product quantity from the remaining (synced) movements.
        const productId = (op.payload as { productId?: string }).productId;
        if (productId) {
          const remaining = await db.stockMovements
            .where("productId")
            .equals(productId)
            .toArray();
          const qty = remaining.reduce((total, movement) => {
            if (movement.syncStatus === "synced") {
              return total + (movement.type === "entry" ? movement.quantity : -movement.quantity);
            }
            return total;
          }, 0);
          const product = await db.products.get(productId);
          if (product) {
            await db.products.update(productId, {
              quantity: qty,
              syncStatus: "synced",
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch {
    // best-effort cleanup: never throw. Caller deletes the outbox row regardless.
  }
}

/**
 * One-shot retry for a permanently_failed outbox operation:
 *  1. Reset the op to pending (retryCount: 0, error cleared).
 *  2. Mark it with `oneShotRetry: true` so the engine knows to treat a
 *     final failure as "abandoned" instead of leaving it stuck.
 *  3. Trigger a sync via the per-tenant SyncEngine singleton.
 *  4. Wait for the engine to drain the op and report the outcome:
 *     - "completed" — server accepted the op, it is now `completed`.
 *     - "deleted"   — final failure; the engine deleted the outbox row
 *                     and cleaned up the local entity.
 *     - "noop"      — the op is no longer in permanently_failed (e.g.
 *                     another tab already retried it).
 *
 * Throws if the op is not in `permanently_failed` status.
 */
export async function retryPermanentlyFailedOperation(
  operationId: string
): Promise<RetryPermanentlyFailedResult> {
  const op = await db.outbox.get(operationId);
  if (!op) {
    throw new Error("Outbox operation not found");
  }

  if (op.status !== "permanently_failed") {
    throw new Error(
      `Cannot retry operation in status "${op.status}" (expected "permanently_failed")`
    );
  }

  const tenantId = op.tenantId ?? (op.payload as { tenantId?: string }).tenantId;
  if (!tenantId) {
    throw new Error("Cannot retry operation without a tenantId");
  }

  await db.outbox.update(operationId, {
    status: "pending",
    retryCount: 0,
    error: null,
    processedAt: null,
    oneShotRetry: true,
  });

  const engine = acquireSyncEngine({ tenantId });
  await engine.sync();

  const after = await db.outbox.get(operationId);
  if (!after) {
    return { outcome: "deleted", operationId };
  }
  if (after.status === "completed") {
    return { outcome: "completed", operationId };
  }
  // Still pending/processing/failed/permanently_failed: noop. Most
  // commonly means the retry triggered a transient failure that did
  // not exhaust retries (status will be "failed" not "deleted"). For
  // the UI's purposes, treat anything that did not get to "completed"
  // and is still present as a noop result.
  return { outcome: "noop", operationId };
}

/**
 * Drop a permanently_failed outbox row and clean up its local entity
 * without attempting another sync. Used by the "Dismiss" button in the
 * permanently-failed list.
 */
export async function dismissPermanentlyFailedOperation(
  operationId: string
): Promise<void> {
  const op = await db.outbox.get(operationId);
  if (!op) {
    return;
  }
  if (op.status !== "permanently_failed") {
    throw new Error(
      `Cannot dismiss operation in status "${op.status}" (expected "permanently_failed")`
    );
  }

  await db.transaction("rw", db.products, db.stockMovements, db.outbox, async () => {
    await cleanupLocalEntityForOp(op);
    await db.outbox.delete(op.id);
  });
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

    const opTenantId =
      operation.tenantId ?? (operation.payload as { tenantId?: unknown }).tenantId;
    if (opTenantId !== tenantId) {
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

export async function markMovementSyncing(input: {
  movementId: string;
  operationId: string;
}): Promise<void> {
  await db.transaction("rw", db.stockMovements, db.outbox, async () => {
    await db.stockMovements.update(input.movementId, {
      syncStatus: "processing",
    });
    await markOperationProcessing(input.operationId);
  });
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
  maxRetries: number;
}): Promise<void> {
  await db.transaction("rw", db.stockMovements, db.outbox, async () => {
    await db.stockMovements.update(input.movementId, {
      syncStatus: "failed",
    });
    await markOperationFailed(input.operationId, input.error, input.maxRetries);
  });
}

// ──────────────────────────────────────────────────────
// Retry Backoff Helpers
// ──────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay with ±20% jitter to prevent
 * thundering herd across multiple tabs or clients.
 */
export function calculateRetryDelay(
  baseRetryDelayMs: number,
  maxRetryDelayMs: number,
  retryCount: number
): number {
  const delay = baseRetryDelayMs * Math.pow(2, retryCount);
  const jitter = delay * 0.2;
  const jittered = delay + (Math.random() * 2 - 1) * jitter;
  return Math.min(Math.max(jittered, 0), maxRetryDelayMs);
}

// ──────────────────────────────────────────────────────
// SyncEngine
// ──────────────────────────────────────────────────────

class SyncEngine {
  private tenantId: string;
  private syncEndpoint: string;
  private maxRetries: number;
  private baseRetryDelayMs: number;
  private maxRetryDelayMs: number;
  private syncIntervalMs: number;

  private currentState: SyncEngineState = {
    state: "offline",
    pendingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    lastError: null,
  };

  private listeners: Set<SyncStateListener> = new Set();
  private syncInProgress = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  constructor(config: SyncEngineConfig) {
    this.tenantId = config.tenantId;
    this.syncEndpoint = config.syncEndpoint ?? "/api/sync";
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseRetryDelayMs =
      config.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    this.maxRetryDelayMs =
      config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.syncIntervalMs =
      config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SyncEngineState {
    return { ...this.currentState };
  }

  private setState(updates: Partial<SyncEngineState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  async start(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    if (this.intervalId) {
      return;
    }

    const updateOnlineState = () => {
      if (navigator.onLine) {
        this.setState({
          state:
            this.currentState.pendingCount > 0 ? "syncing" : "upToDate",
        });
        void this.sync();
      } else {
        this.setState({ state: "offline" });
      }
    };

    this.onlineListener = updateOnlineState;
    this.offlineListener = () => this.setState({ state: "offline" });

    window.addEventListener("online", this.onlineListener);
    window.addEventListener("offline", this.offlineListener);

    updateOnlineState();

    this.intervalId = setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        void this.sync();
      }
    }, this.syncIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (typeof window !== "undefined") {
      if (this.onlineListener) {
        window.removeEventListener("online", this.onlineListener);
      }
      if (this.offlineListener) {
        window.removeEventListener("offline", this.offlineListener);
      }
    }

    this.onlineListener = null;
    this.offlineListener = null;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async sync(): Promise<void> {
    if (this.syncInProgress) {
      return;
    }

    if (typeof window !== "undefined" && !navigator.onLine) {
      this.setState({ state: "offline" });
      return;
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    try {
      const pendingOps = await claimPendingOperations(
        this.tenantId,
        this.maxRetries,
        this.baseRetryDelayMs,
        this.maxRetryDelayMs
      );

      if (pendingOps.length === 0) {
        this.setState({
          state: "upToDate",
          pendingCount: 0,
          failedCount: await this.getFailedCount(),
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });
        return;
      }

      this.setState({
        state: "syncing",
        pendingCount: pendingOps.length,
      });

      const operations = pendingOps.map((op) => ({
        operationId: op.operationId,
        idempotencyKey: op.operationId,
        entityId: op.entityId,
        entityType: op.entityType,
        operationType: op.operationType,
        tenantId:
          op.tenantId ??
          (op.payload as { tenantId?: string }).tenantId ??
          this.tenantId,
        payload: op.payload,
      }));

      const request: SyncRequest = {
        checkpoint: this.currentState.lastSyncAt ?? undefined,
        operations,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (operations.length === 1) {
        headers["Idempotency-Key"] = operations[0]!.operationId;
      }

      let response: Response;
      try {
        response = await fetch(this.syncEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
          signal: this.abortController.signal,
        });
      } catch (fetchError) {
        // Network/HTTP error before we got a response: revert ONLY the ops
        // we just claimed. See PR #15 review (B5).
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : "Sync failed";
        this.setState({
          state: "error",
          lastError: errorMessage,
        });
        await this.markOperationsForRetry(pendingOps, errorMessage);
        return;
      }

      if (!response.ok) {
        if (response.status === 429) {
          await this.markOperationsForRetry(
            pendingOps,
            "Rate limited. Will retry later."
          );
          this.setState({
            state: "error",
            lastError: "Rate limited. Will retry later.",
          });
          return;
        }
        const errorMessage = `Sync failed with status ${response.status}`;
        this.setState({
          state: "error",
          lastError: errorMessage,
        });
        await this.markOperationsForRetry(pendingOps, errorMessage);
        return;
      }

      const syncResponse: SyncResponse = await response.json();
      await this.processSyncResults(pendingOps, syncResponse.results);

      const remainingPending = await this.getPendingCount();
      const remainingFailed = await this.getFailedCount();

      this.setState({
        state:
          remainingPending > 0
            ? "syncing"
            : remainingFailed > 0
              ? "error"
              : "upToDate",
        pendingCount: remainingPending,
        failedCount: remainingFailed,
        lastSyncAt: syncResponse.checkpoint,
        lastError:
          remainingFailed > 0
            ? `${remainingFailed} operations failed`
            : null,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Sync failed";
      this.setState({
        state: "error",
        lastError: errorMessage,
      });

      // Without the claimed-ops set, mark ALL processing rows for retry.
      // This is the worst-case fallback for unexpected throw escapes.
      await this.markOperationsForRetry([], errorMessage);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  private async getPendingCount(): Promise<number> {
    let indexed = 0;
    try {
      indexed = await db.outbox
        .where("[tenantId+status]")
        .equals([this.tenantId, "pending"])
        .count();
    } catch {
      indexed = 0;
    }
    if (indexed > 0) {
      return indexed;
    }
    // Fallback for legacy rows (pre-v6 schema) that still rely on
    // payload.tenantId: the indexed query cannot see them.
    const all = await db.outbox.toArray();
    return all.filter((op) => {
      if (op.status !== "pending") return false;
      if (op.tenantId === this.tenantId) return true;
      return (
        !op.tenantId &&
        (op.payload as { tenantId?: string }).tenantId === this.tenantId
      );
    }).length;
  }

  /**
   * Includes BOTH "failed" (retryable) and "permanently_failed"
   * (terminal). The UI distinguishes them by looking at the
   * permanently-failed list separately. PR #15 review (B4).
   */
  private async getFailedCount(): Promise<number> {
    let indexed = 0;
    try {
      const failedRows = await db.outbox
        .where("[tenantId+status]")
        .equals([this.tenantId, "failed"])
        .count();
      const permanentlyRows = await db.outbox
        .where("[tenantId+status]")
        .equals([this.tenantId, "permanently_failed"])
        .count();
      indexed = failedRows + permanentlyRows;
    } catch {
      indexed = 0;
    }
    if (indexed > 0) {
      return indexed;
    }
    const all = await db.outbox.toArray();
    return all.filter((op) => {
      if (op.status !== "failed" && op.status !== "permanently_failed") {
        return false;
      }
      if (op.tenantId === this.tenantId) return true;
      return (
        !op.tenantId &&
        (op.payload as { tenantId?: string }).tenantId === this.tenantId
      );
    }).length;
  }

  private async processSyncResults(
    operations: OutboxOperation[],
    results: SyncResult[]
  ): Promise<void> {
    const resultMap = new Map(results.map((r) => [r.operationId, r]));

    for (const op of operations) {
      const result = resultMap.get(op.operationId);
      if (!result) {
        await this.handlePermanentFailure(op, {
          operationId: op.operationId,
          status: "validation_error",
          message: "No sync result returned by server",
        });
        continue;
      }

      switch (result.status) {
        case "success":
        case "duplicate":
          await this.handleSuccess(op, result);
          break;
        case "conflict_resolved":
          await this.handleConflictResolved(op, result);
          break;
        case "validation_error":
        case "tenant_mismatch":
        case "not_found":
          await this.handlePermanentFailure(op, result);
          break;
        case "rate_limited":
          await this.handleRetryableFailure(op, result);
          break;
      }
    }
  }

  private async handleSuccess(
    op: OutboxOperation,
    result: SyncResult
  ): Promise<void> {
    await markOperationCompleted(
      op.operationId,
      result.serverState?.id as string | undefined
    );

    if (op.entityType === "product") {
      await applyServerProductState(op.entityId, result.serverState);
      await updateProductSyncStatus(op.entityId, "synced");
    } else if (op.entityType === "stockMovement") {
      await markMovementSynced({
        movementId: op.entityId,
        operationId: op.operationId,
        serverMovementId: result.serverState?.id as string | undefined,
      });
    }
  }

  private async handleConflictResolved(
    op: OutboxOperation,
    result: SyncResult
  ): Promise<void> {
    await markOperationCompleted(op.operationId);

    if (op.entityType === "product" && result.serverState) {
      await applyServerProductState(op.entityId, result.serverState);
      await updateProductSyncStatus(op.entityId, "synced");
    } else if (op.entityType === "stockMovement") {
      await markMovementSynced({
        movementId: op.entityId,
        operationId: op.operationId,
        serverMovementId: result.serverState?.id as string | undefined,
      });
    }
  }

  private async handlePermanentFailure(
    op: OutboxOperation,
    result: SyncResult
  ): Promise<void> {
    // oneShotRetry means the user explicitly clicked "Retry" on a
    // permanently_failed op. If the final attempt fails again we treat
    // the op as abandoned: clean up the local entity and delete the
    // outbox row instead of leaving it stuck on permanently_failed.
    if (op.oneShotRetry === true) {
      await db.transaction(
        "rw",
        db.products,
        db.stockMovements,
        db.outbox,
        async () => {
          await cleanupLocalEntityForOp(op);
          await db.outbox.delete(op.id);
        }
      );
      return;
    }

    await markOperationFailed(
      op.operationId,
      result.message ?? `Permanent failure: ${result.status}`,
      this.maxRetries
    );

    if (op.entityType === "product") {
      await updateProductSyncStatus(op.entityId, "failed");
    } else if (op.entityType === "stockMovement") {
      await markMovementSyncFailed({
        movementId: op.entityId,
        operationId: op.operationId,
        error: result.message ?? `Permanent failure: ${result.status}`,
        maxRetries: this.maxRetries,
      });
    }
  }

  private async handleRetryableFailure(
    op: OutboxOperation,
    result: SyncResult
  ): Promise<void> {
    if (op.retryCount >= this.maxRetries) {
      await this.handlePermanentFailure(op, result);
      return;
    }

    await markOperationFailed(
      op.operationId,
      result.message ?? "Retryable failure, will retry",
      this.maxRetries
    );
  }

  /**
   * Revert operations currently stuck in "processing" back to "failed"
   * (or "permanently_failed" when the retry budget is exhausted).
   *
   * Critical for multi-tab correctness: we MUST only touch the ops that
   * THIS engine instance claimed this turn. The pre-PR implementation
   * scanned every processing row globally, which meant an aborted sync
   * in tab A would clobber a perfectly valid in-flight sync started by
   * tab B. PR #15 review (B5).
   *
   * `claimedThisTurn` is the set of operations returned by
   * `claimPendingOperations` and not yet finalised. When it is empty
   * (e.g. unexpected throw path), we fall back to scanning the table
   * for rows that are still "processing" but only for this tenant.
   */
  private async markOperationsForRetry(
    claimedThisTurn: OutboxOperation[],
    errorMessage: string
  ): Promise<void> {
    let opsToRevert: OutboxOperation[];

    if (claimedThisTurn.length > 0) {
      opsToRevert = claimedThisTurn;
    } else {
      // Fallback: only consider processing rows that belong to this
      // tenant. We do NOT cross tenant boundaries.
      const all = await db.outbox.toArray();
      opsToRevert = all.filter((op) => {
        if (op.status !== "processing") return false;
        const opTenantId =
          op.tenantId ?? (op.payload as { tenantId?: string }).tenantId;
        return opTenantId === this.tenantId;
      });
    }

    for (const op of opsToRevert) {
      const opTenantId =
        op.tenantId ?? (op.payload as { tenantId?: string }).tenantId;
      if (opTenantId !== this.tenantId) {
        continue;
      }

      if (op.retryCount >= this.maxRetries) {
        await markOperationFailed(
          op.operationId,
          "Max retries exceeded",
          this.maxRetries
        );
      } else {
        await markOperationFailed(
          op.operationId,
          errorMessage,
          this.maxRetries
        );
      }
    }
  }

  /**
   * Calculate retry delay with jitter. Exposed for testing.
   */
  calculateRetryDelay(retryCount: number): number {
    return calculateRetryDelay(
      this.baseRetryDelayMs,
      this.maxRetryDelayMs,
      retryCount
    );
  }
}

// ──────────────────────────────────────────────────────
// Singleton Management
// ──────────────────────────────────────────────────────

const syncEngineInstances = new Map<string, SyncEngine>();
const syncEngineRefCounts = new Map<string, number>();

export function getSyncEngine(config: SyncEngineConfig): SyncEngine {
  const existing = syncEngineInstances.get(config.tenantId);
  if (existing) {
    return existing;
  }

  const instance = new SyncEngine(config);
  syncEngineInstances.set(config.tenantId, instance);
  return instance;
}

export function acquireSyncEngine(config: SyncEngineConfig): SyncEngine {
  const engine = getSyncEngine(config);
  const count = syncEngineRefCounts.get(config.tenantId) ?? 0;
  syncEngineRefCounts.set(config.tenantId, count + 1);
  return engine;
}

export function releaseSyncEngine(tenantId: string): void {
  const count = syncEngineRefCounts.get(tenantId);
  if (!count) {
    return;
  }

  if (count <= 1) {
    syncEngineRefCounts.delete(tenantId);
    const engine = syncEngineInstances.get(tenantId);
    if (engine) {
      engine.stop();
      syncEngineInstances.delete(tenantId);
    }
    return;
  }

  syncEngineRefCounts.set(tenantId, count - 1);
}

export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  return new SyncEngine(config);
}

export type { OutboxOperation, SyncEngine };
