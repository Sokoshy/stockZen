import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { stockMovementSyncSchema } from "~/schemas/stock-movements";
import { inventoryService } from "~/server/services/inventory-service";

export const stockMovementsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(stockMovementSyncSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and, eq }) => and(eq(tm.userId, ctx.session.user.id), eq(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      try {
        const movement = await inventoryService.createMovement({
          db: ctx.db,
          tenantId,
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

  listByProduct: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tenant context is required",
        });
      }

      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and, eq }) => and(eq(tm.userId, ctx.session.user.id), eq(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      const movements = await inventoryService.getMovementsByProduct({
        db: ctx.db,
        tenantId,
        productId: input.productId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return movements;
    }),

  getPendingCount: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      return 0;
    }

    const membership = await ctx.db.query.tenantMemberships.findFirst({
      columns: { role: true },
      where: (tm, { and, eq }) => and(eq(tm.userId, ctx.session.user.id), eq(tm.tenantId, tenantId)),
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not a member of this tenant",
      });
    }

    const count = await inventoryService.getPendingMovementCount(ctx.db, tenantId);
    return count;
  }),
});
