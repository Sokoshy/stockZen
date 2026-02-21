import { products, stockMovements } from "~/server/db/schema";
import { eq, and, desc, lt, or, sql } from "drizzle-orm";
import { logger } from "~/server/logger";
import {
  flushPendingCriticalAlertNotifications,
  updateAlertLifecycle,
  type CriticalAlertNotificationTask,
} from "~/server/services/alert-service";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

type InventoryDbClient = PostgresJsDatabase<typeof schema>;

export interface CreateMovementInput {
  db: InventoryDbClient;
  tenantId: string;
  userId: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  idempotencyKey?: string;
}

export interface MovementOutput {
  id: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  createdAt: Date;
}

export interface MovementListOutput {
  id: string;
  productId: string;
  type: "entry" | "exit";
  quantity: number;
  createdAt: Date;
  syncStatus: "synced";
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const separatorIndex = decoded.lastIndexOf("|");
    if (separatorIndex === -1) return null;
    const createdAtStr = decoded.substring(0, separatorIndex);
    const id = decoded.substring(separatorIndex + 1);
    if (!createdAtStr || !id) return null;
    return { createdAt: createdAtStr, id };
  } catch {
    return null;
  }
}

export const inventoryService = {
  async createMovement(input: CreateMovementInput): Promise<MovementOutput> {
    const { db: dbClient, tenantId, userId, productId, type, quantity, idempotencyKey } = input;

    const pendingCriticalNotifications: CriticalAlertNotificationTask[] = [];

    const movement = await dbClient.transaction(async (tx) => {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
      });

      if (!product) {
        throw new Error("Product not found");
      }

      if (idempotencyKey) {
        const existing = await tx.query.stockMovements.findFirst({
          where: and(
            eq(stockMovements.tenantId, tenantId),
            eq(stockMovements.idempotencyKey, idempotencyKey)
          ),
        });

        if (existing) {
          logger.info(
            { movementId: existing.id, idempotencyKey },
            "Duplicate movement detected, returning existing"
          );
          return {
            id: existing.id,
            productId: existing.productId,
            type: existing.type,
            quantity: existing.quantity,
            createdAt: existing.createdAt,
          };
        }
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId,
          productId,
          userId,
          type,
          quantity,
          idempotencyKey: idempotencyKey ?? null,
        })
        .returning();

      if (!movement) {
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
        pendingCriticalNotifications,
      });

      logger.info(
        { movementId: movement.id, productId, type, quantity },
        "Stock movement created successfully"
      );

      return {
        id: movement.id,
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        createdAt: movement.createdAt,
      };
    });

    if (pendingCriticalNotifications.length > 0) {
      await flushPendingCriticalAlertNotifications(dbClient, pendingCriticalNotifications);
    }

    return movement;
  },

  async getMovementsByProduct({
    db,
    tenantId,
    productId,
    limit = 50,
    cursor,
  }: {
    db: InventoryDbClient;
    tenantId: string;
    productId: string;
    limit: number;
    cursor?: string;
  }): Promise<{
    movements: MovementListOutput[];
    nextCursor?: string;
  }> {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const baseConditions = and(
      eq(stockMovements.tenantId, tenantId),
      eq(stockMovements.productId, productId)
    );

    let whereClause = baseConditions;

    if (cursorData) {
      whereClause = and(
        baseConditions,
        sql`(
          ${stockMovements.createdAt} < ${cursorData.createdAt}::timestamptz
          OR (
            ${stockMovements.createdAt} = ${cursorData.createdAt}::timestamptz
            AND ${stockMovements.id} < ${cursorData.id}::uuid
          )
        )`
      );
    }

    const results = await db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(whereClause)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const movements = hasMore ? results.slice(0, limit) : results;

    const lastMovement = movements[movements.length - 1];
    const nextCursor =
      hasMore && lastMovement
        ? encodeCursor(lastMovement.createdAt, lastMovement.id)
        : undefined;

    return {
      movements: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        createdAt: m.createdAt,
        syncStatus: "synced" as const,
      })),
      nextCursor,
    };
  },

  async getPendingMovementCount(_db: InventoryDbClient, _tenantId: string): Promise<number> {
    // This would be used for sync status - count movements created after last sync
    // For now, return 0 as sync logic is in Story 2.5
    return 0;
  },
};
