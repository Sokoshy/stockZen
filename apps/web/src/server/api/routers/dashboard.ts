import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getDashboardStats } from "~/server/services/dashboard-service";

export const dashboardRouter = createTRPCRouter({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId!;

    const stats = await getDashboardStats({
      db: ctx.db,
      tenantId,
    });

    return stats;
  }),
});
