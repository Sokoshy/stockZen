import { and, eq, sql } from "drizzle-orm";
import { products, stockMovements, tenants } from "~/server/db/schema";
import { logger } from "~/server/logger";
import { updateAlertLifecycle } from "~/server/services/alert-service";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";
import type {
  SyncOperation,
  SyncResponse,
  SyncResult,
  SyncResultStatus,
} from "~/schemas/sync";

type DbClient = PostgresJsDatabase<typeof schema>;

interface ProcessOperationInput {
  db: DbClient;
  tenantId: string;
  userId: string;
  operation: SyncOperation;
}

interface SyncServiceInput {
  db: DbClient;
  tenantId: string;
  userId: string;
  operations: SyncOperation[];
}

function generateCheckpoint(): string {
  return new Date().toISOString();
}

function parseClientTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isThresholdMode(value: unknown): value is "defaults" | "custom" {
  return value === "defaults" || value === "custom";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseCustomThresholdPair(
  criticalRaw: unknown,
  attentionRaw: unknown
):
  | { ok: true; criticalThreshold: number; attentionThreshold: number }
  | { ok: false; message: string } {
  if (!isPositiveInteger(criticalRaw)) {
    return {
      ok: false,
      message: "Critical threshold must be a positive integer",
    };
  }

  if (!isPositiveInteger(attentionRaw)) {
    return {
      ok: false,
      message: "Attention threshold must be a positive integer",
    };
  }

  if (criticalRaw >= attentionRaw) {
    return {
      ok: false,
      message: "Critical threshold must be less than attention threshold",
    };
  }

  return {
    ok: true,
    criticalThreshold: criticalRaw,
    attentionThreshold: attentionRaw,
  };
}

function buildServerProductState(product: typeof products.$inferSelect): Record<string, unknown> {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    unit: product.unit,
    barcode: product.barcode,
    price: Number(product.price),
    purchasePrice: product.purchasePrice != null ? Number(product.purchasePrice) : null,
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    customCriticalThreshold: product.customCriticalThreshold,
    customAttentionThreshold: product.customAttentionThreshold,
    deletedAt: product.deletedAt,
    updatedAt: product.updatedAt,
  };
}

async function processProductCreate(
  input: ProcessOperationInput
): Promise<{ status: SyncResultStatus; serverState?: Record<string, unknown>; message?: string }> {
  const { db, tenantId, operation } = input;
  const payload = operation.payload as Record<string, unknown>;
  const entityId = operation.entityId;

  const existingProduct = await db.query.products.findFirst({
    where: and(
      eq(products.id, entityId),
      eq(products.tenantId, tenantId)
    ),
  });

  if (existingProduct) {
    return {
      status: "duplicate",
      serverState: buildServerProductState(existingProduct),
    };
  }

  const thresholdModeRaw = payload.thresholdMode ?? "defaults";
  if (!isThresholdMode(thresholdModeRaw)) {
    return {
      status: "validation_error",
      message: "thresholdMode must be either 'defaults' or 'custom'",
    };
  }

  let customCriticalThreshold: number | null = null;
  let customAttentionThreshold: number | null = null;

  if (thresholdModeRaw === "custom") {
    const parsedPair = parseCustomThresholdPair(
      payload.customCriticalThreshold,
      payload.customAttentionThreshold
    );

    if (!parsedPair.ok) {
      return {
        status: "validation_error",
        message: parsedPair.message,
      };
    }

    customCriticalThreshold = parsedPair.criticalThreshold;
    customAttentionThreshold = parsedPair.attentionThreshold;
  }

  const [newProduct] = await db
    .insert(products)
    .values({
      id: entityId,
      tenantId,
      name: payload.name as string,
      description: payload.description as string | null ?? null,
      sku: payload.sku as string | null ?? null,
      category: payload.category as string | null ?? null,
      unit: payload.unit as string | null ?? null,
      barcode: payload.barcode as string | null ?? null,
      price: String(payload.price ?? 0),
      purchasePrice: payload.purchasePrice != null ? String(payload.purchasePrice) : null,
      quantity: (payload.quantity as number) ?? 0,
      lowStockThreshold: payload.lowStockThreshold as number | null ?? null,
      customCriticalThreshold,
      customAttentionThreshold,
    })
    .returning();

  if (!newProduct) {
    return { status: "validation_error", message: "Failed to create product" };
  }

  logger.info({ productId: newProduct.id, tenantId }, "Product created via sync");

  await updateAlertLifecycle({
    db,
    tenantId,
    productId: newProduct.id,
    currentStock: newProduct.quantity,
  });

  return {
    status: "success",
    serverState: buildServerProductState(newProduct),
  };
}

async function processProductUpdate(
  input: ProcessOperationInput
): Promise<{ status: SyncResultStatus; serverState?: Record<string, unknown>; message?: string }> {
  const { db, tenantId, operation } = input;
  const payload = operation.payload as Record<string, unknown>;
  const entityId = operation.entityId;

  const existingProduct = await db.query.products.findFirst({
    where: and(eq(products.id, entityId), eq(products.tenantId, tenantId)),
  });

  if (!existingProduct) {
    return { status: "not_found", message: "Product not found" };
  }

  const updatedFields = payload.updatedFields as Record<string, unknown> | undefined;
  const clientUpdatedAt = parseClientTimestamp(payload.clientUpdatedAt);

  if (clientUpdatedAt && existingProduct.updatedAt > clientUpdatedAt) {
    return {
      status: "conflict_resolved",
      message: "Server has a newer version. Applied server-authoritative state.",
      serverState: buildServerProductState(existingProduct),
    };
  }

  let customCriticalThreshold = existingProduct.customCriticalThreshold;
  let customAttentionThreshold = existingProduct.customAttentionThreshold;

  const hasCustomCriticalInPayload =
    updatedFields !== undefined &&
    Object.prototype.hasOwnProperty.call(updatedFields, "customCriticalThreshold");
  const hasCustomAttentionInPayload =
    updatedFields !== undefined &&
    Object.prototype.hasOwnProperty.call(updatedFields, "customAttentionThreshold");
  const shouldRecomputeAlert = updatedFields?.thresholdMode !== undefined;

  if (updatedFields?.thresholdMode === undefined) {
    if (hasCustomCriticalInPayload || hasCustomAttentionInPayload) {
      return {
        status: "validation_error",
        message: "thresholdMode is required when updating custom thresholds",
      };
    }
  } else {
    if (!isThresholdMode(updatedFields.thresholdMode)) {
      return {
        status: "validation_error",
        message: "thresholdMode must be either 'defaults' or 'custom'",
      };
    }

    if (updatedFields.thresholdMode === "defaults") {
      if (
        (hasCustomCriticalInPayload && updatedFields.customCriticalThreshold != null) ||
        (hasCustomAttentionInPayload && updatedFields.customAttentionThreshold != null)
      ) {
        return {
          status: "validation_error",
          message: "Custom thresholds must be omitted when using tenant defaults",
        };
      }

      customCriticalThreshold = null;
      customAttentionThreshold = null;
    } else {
      const parsedPair = parseCustomThresholdPair(
        updatedFields.customCriticalThreshold,
        updatedFields.customAttentionThreshold
      );

      if (!parsedPair.ok) {
        return {
          status: "validation_error",
          message: parsedPair.message,
        };
      }

      customCriticalThreshold = parsedPair.criticalThreshold;
      customAttentionThreshold = parsedPair.attentionThreshold;
    }
  }

  const [updatedProduct] = await db
    .update(products)
    .set({
      name: (updatedFields?.name as string) ?? existingProduct.name,
      description: updatedFields?.description !== undefined 
        ? (updatedFields.description as string | null) 
        : existingProduct.description,
      sku: updatedFields?.sku !== undefined 
        ? (updatedFields.sku as string | null) 
        : existingProduct.sku,
      category: (updatedFields?.category as string) ?? existingProduct.category,
      unit: (updatedFields?.unit as string) ?? existingProduct.unit,
      barcode: updatedFields?.barcode !== undefined 
        ? (updatedFields.barcode as string | null) 
        : existingProduct.barcode,
      price: updatedFields?.price != null 
        ? String(updatedFields.price) 
        : existingProduct.price,
      purchasePrice: updatedFields?.purchasePrice !== undefined 
        ? (updatedFields.purchasePrice != null ? String(updatedFields.purchasePrice) : null)
        : existingProduct.purchasePrice,
      lowStockThreshold: updatedFields?.lowStockThreshold !== undefined 
        ? (updatedFields.lowStockThreshold as number | null) 
        : existingProduct.lowStockThreshold,
      customCriticalThreshold,
      customAttentionThreshold,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, entityId), eq(products.tenantId, tenantId)))
    .returning();

  if (!updatedProduct) {
    return { status: "validation_error", message: "Failed to update product" };
  }

  logger.info({ productId: updatedProduct.id, tenantId }, "Product updated via sync");

  if (shouldRecomputeAlert) {
    await updateAlertLifecycle({
      db,
      tenantId,
      productId: updatedProduct.id,
      currentStock: updatedProduct.quantity,
    });
  }

  return {
    status: "success",
    serverState: buildServerProductState(updatedProduct),
  };
}

async function processProductDelete(
  input: ProcessOperationInput
): Promise<{ status: SyncResultStatus; serverState?: Record<string, unknown>; message?: string }> {
  const { db, tenantId, operation } = input;
  const entityId = operation.entityId;

  const existingProduct = await db.query.products.findFirst({
    where: and(eq(products.id, entityId), eq(products.tenantId, tenantId)),
  });

  if (!existingProduct) {
    return { status: "not_found", message: "Product not found" };
  }

  const [deletedProduct] = await db
    .update(products)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, entityId), eq(products.tenantId, tenantId)))
    .returning();

  if (!deletedProduct) {
    return { status: "validation_error", message: "Failed to delete product" };
  }

  logger.info({ productId: deletedProduct.id, tenantId }, "Product deleted via sync");

  return {
    status: "success",
    serverState: {
      id: deletedProduct.id,
      deletedAt: deletedProduct.deletedAt,
    },
  };
}

async function processStockMovementCreate(
  input: ProcessOperationInput
): Promise<{ status: SyncResultStatus; serverState?: Record<string, unknown>; message?: string }> {
  const { db, tenantId, userId, operation } = input;
  const payload = operation.payload as Record<string, unknown>;
  const idempotencyKey =
    (payload.idempotencyKey as string | undefined) ??
    operation.idempotencyKey ??
    operation.operationId;

  const existingMovement = await db.query.stockMovements.findFirst({
    where: and(
      eq(stockMovements.tenantId, tenantId),
      eq(stockMovements.idempotencyKey, idempotencyKey)
    ),
  });

  if (existingMovement) {
    logger.info(
      { movementId: existingMovement.id, idempotencyKey },
      "Duplicate movement detected via sync"
    );
    return {
      status: "duplicate",
      serverState: {
        id: existingMovement.id,
        createdAt: existingMovement.createdAt,
      },
    };
  }

  const productId = payload.productId as string;
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
  });

  if (!product) {
    return { status: "not_found", message: "Product not found" };
  }

  const type = payload.type as "entry" | "exit";
  const quantity = payload.quantity as number;

  const result = await db.transaction(async (tx) => {
    const [newMovement] = await tx
      .insert(stockMovements)
      .values({
        tenantId,
        productId,
        userId,
        type,
        quantity,
        idempotencyKey,
      })
      .returning();

    if (!newMovement) {
      throw new Error("Failed to create movement");
    }

    const stockChange = type === "entry" ? quantity : -quantity;
    const [updatedProduct] = await tx
      .update(products)
      .set({
        quantity: sql`${products.quantity} + ${stockChange}`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
      .returning({
        quantity: products.quantity,
      });

    if (!updatedProduct) {
      throw new Error("Product not found");
    }

    const newQuantity = updatedProduct.quantity;

    await updateAlertLifecycle({
      db: tx,
      tenantId,
      productId,
      currentStock: newQuantity,
    });

    return { movement: newMovement, newQuantity };
  });

  if (!result) {
    return { status: "validation_error", message: "Failed to create movement" };
  }

  logger.info(
    { movementId: result.movement.id, productId, type, quantity, tenantId },
    "Stock movement created via sync"
  );

  return {
    status: "success",
    serverState: {
      id: result.movement.id,
      productId: result.movement.productId,
      type: result.movement.type,
      quantity: result.movement.quantity,
      createdAt: result.movement.createdAt,
    },
  };
}

async function processOperation(
  input: ProcessOperationInput
): Promise<SyncResult> {
  const { operation, tenantId } = input;

  const operationTenantId = (operation.payload as { tenantId?: string }).tenantId;
  if (operationTenantId && operationTenantId !== tenantId) {
    return {
      operationId: operation.operationId,
      status: "tenant_mismatch",
      code: "TENANT_MISMATCH",
      message: "Operation tenant does not match authenticated tenant",
    };
  }

  let result: { status: SyncResultStatus; serverState?: Record<string, unknown>; message?: string };

  try {
    if (operation.entityType === "product") {
      switch (operation.operationType) {
        case "create":
          result = await processProductCreate(input);
          break;
        case "update":
          result = await processProductUpdate(input);
          break;
        case "delete":
          result = await processProductDelete(input);
          break;
      }
    } else if (operation.entityType === "stockMovement") {
      switch (operation.operationType) {
        case "create":
          result = await processStockMovementCreate(input);
          break;
        case "update":
        case "delete":
          return {
            operationId: operation.operationId,
            status: "validation_error",
            code: "UNSUPPORTED_OPERATION",
            message: `Stock movements do not support ${operation.operationType}`,
          };
      }
    } else {
      return {
        operationId: operation.operationId,
        status: "validation_error",
        code: "UNKNOWN_ENTITY_TYPE",
        message: `Unknown entity type: ${operation.entityType}`,
      };
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error", operationId: operation.operationId },
      "Operation processing failed"
    );
    return {
      operationId: operation.operationId,
      status: "validation_error",
      message: error instanceof Error ? error.message : "Processing failed",
    };
  }

  const syncResult: SyncResult = {
    operationId: operation.operationId,
    status: result.status,
    message: result.message,
    serverState: result.serverState,
  };

  if (result.status !== "success" && result.status !== "duplicate") {
    syncResult.code = result.status.toUpperCase();
  }

  return syncResult;
}

export async function processSync(input: SyncServiceInput): Promise<SyncResponse> {
  const { db, tenantId, userId, operations } = input;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const results: SyncResult[] = [];

  for (const operation of operations) {
    const result = await processOperation({
      db,
      tenantId,
      userId,
      operation,
    });
    results.push(result);
  }

  const checkpoint = generateCheckpoint();

  logger.info(
    { tenantId, operationCount: operations.length, checkpoint },
    "Sync processed"
  );

  return {
    checkpoint,
    results,
  };
}

export const syncService = {
  processSync,
};
