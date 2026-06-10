import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, membershipProcedure } from "~/server/api/trpc";
import { stockMovementSyncSchema } from "~/schemas/stock-movements";
import { inventoryService } from "~/server/services/inventory-service";

export const stockMovementsRouter = createTRPCRouter({
  create: membershipProcedure
    .input(stockMovementSyncSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const movement = await inventoryService.createMovement({
          db: ctx.db,
          tenantId: ctx.tenantId!,
          userId: ctx.session.user.id,
          productId: input.productId,
          type: input.type,
          quantity: input.quantity,
          idempotencyKey: input.idempotencyKey,
        });

        return movement;
      } catch (error) {
        if (error instanceof Error && error.message === "Product not found") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Product not found",
          });
        }

        throw error;
      }
    }),

  listByProduct: membershipProcedure
    .input(
      z.object({
        productId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const movements = await inventoryService.getMovementsByProduct({
        db: ctx.db,
        tenantId: ctx.tenantId!,
        productId: input.productId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return movements;
    }),

  getPendingCount: membershipProcedure.query(async ({ ctx }) => {
    const count = await inventoryService.getPendingMovementCount(ctx.db, ctx.tenantId!);
    return count;
  }),
});
