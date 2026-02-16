import { products, stockMovements } from "~/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "~/server/logger";
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

export const inventoryService = {
  async createMovement(input: CreateMovementInput): Promise<MovementOutput> {
    const { db: dbClient, tenantId, userId, productId, type, quantity, idempotencyKey } = input;

    return dbClient.transaction(async (tx) => {
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
      await tx
        .update(products)
        .set({
          quantity: product.quantity + stockChange,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));

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
    movements: MovementOutput[];
    nextCursor?: string;
  }> {
    const query = db.query.stockMovements.findMany({
      where: and(
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.productId, productId)
      ),
      orderBy: [desc(stockMovements.createdAt)],
      limit: limit + 1,
    });

    if (cursor) {
      // Add cursor-based pagination if needed
    }

    const results = await query;

    const hasMore = results.length > limit;
    const movements = hasMore ? results.slice(0, limit) : results;

    return {
      movements: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        createdAt: m.createdAt,
      })),
      nextCursor: hasMore ? movements[movements.length - 1]?.id : undefined,
    };
  },

  async getPendingMovementCount(_db: InventoryDbClient, _tenantId: string): Promise<number> {
    // This would be used for sync status - count movements created after last sync
    // For now, return 0 as sync logic is in Story 2.5
    return 0;
  },
};
