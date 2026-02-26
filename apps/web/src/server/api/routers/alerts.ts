import { TRPCError } from "@trpc/server";
import {
  listActiveAlertsInputSchema,
  listActiveAlertsOutputSchema,
  markHandledInputSchema,
  snoozeAlertInputSchema,
} from "~/schemas/alerts";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { markHandled, snoozeForEightHours, listActiveAlerts } from "~/server/services/alert-service";
import { logger } from "~/server/logger";

export const alertsRouter = createTRPCRouter({
  listActive: protectedProcedure
    .input(listActiveAlertsInputSchema)
    .output(listActiveAlertsOutputSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;

      const { alerts, nextCursor } = await listActiveAlerts({
        db: ctx.db,
        tenantId,
        cursor: input.cursor,
        limit: input.limit ?? 20,
      });

      logger.debug({ userId, tenantId, alertCount: alerts.length }, "Active alerts listed");

      return {
        alerts: alerts.map((alert) => ({
          id: alert.id,
          productId: alert.productId,
          productName: alert.productName,
          level: alert.level,
          currentStock: alert.currentStock,
          snoozedUntil: alert.snoozedUntil?.toISOString() ?? null,
          createdAt: alert.createdAt.toISOString(),
          updatedAt: alert.updatedAt.toISOString(),
        })),
        nextCursor,
      };
    }),

  markHandled: protectedProcedure
    .input(markHandledInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;

      try {
        await markHandled({
          db: ctx.db,
          tenantId,
          alertId: input.alertId,
        });

        logger.info({ userId, tenantId, alertId: input.alertId }, "Alert marked as handled");

        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Alert not found",
          });
        }
        if (error instanceof Error && error.message === "BAD_REQUEST") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot mark a non-active alert as handled",
          });
        }
        throw error;
      }
    }),

  snooze: protectedProcedure
    .input(snoozeAlertInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;

      try {
        await snoozeForEightHours({
          db: ctx.db,
          tenantId,
          alertId: input.alertId,
        });

        logger.info({ userId, tenantId, alertId: input.alertId }, "Alert snoozed for 8 hours");

        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Alert not found",
          });
        }
        if (error instanceof Error && error.message === "BAD_REQUEST") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot snooze a non-active alert",
          });
        }
        throw error;
      }
    }),
});
