import { TRPCError } from "@trpc/server";
import { eq, and, isNull } from "drizzle-orm";

import {
  tenantDefaultThresholdsOutputSchema,
  updateTenantDefaultThresholdsInputSchema,
} from "~/schemas/tenant-thresholds";
import { createTRPCRouter, membershipProcedure } from "~/server/api/trpc";
import { canManageTenantMembers } from "~/server/auth/rbac-policy";
import { products, tenants } from "~/server/db/schema";
import { recomputeAlertsForProducts } from "~/server/services/alert-service";

export const tenantThresholdsRouter = createTRPCRouter({
  getTenantDefaultThresholds: membershipProcedure
    .output(tenantDefaultThresholdsOutputSchema)
    .query(async ({ ctx }) => {
      const [tenant] = await ctx.db
        .select({
          criticalThreshold: tenants.defaultCriticalThreshold,
          attentionThreshold: tenants.defaultAttentionThreshold,
        })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      return tenant;
    }),

  updateTenantDefaultThresholds: membershipProcedure
    .input(updateTenantDefaultThresholdsInputSchema)
    .output(tenantDefaultThresholdsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageTenantMembers(ctx.membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins can update tenant default thresholds",
        });
      }

      const [updated] = await ctx.db
        .update(tenants)
        .set({
          defaultCriticalThreshold: input.criticalThreshold,
          defaultAttentionThreshold: input.attentionThreshold,
        })
        .where(eq(tenants.id, ctx.tenantId!))
        .returning({
          criticalThreshold: tenants.defaultCriticalThreshold,
          attentionThreshold: tenants.defaultAttentionThreshold,
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Failed to update tenant thresholds",
        });
      }

      const productsUsingDefaults = await ctx.db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.tenantId, ctx.tenantId!),
            isNull(products.deletedAt),
            isNull(products.customCriticalThreshold),
            isNull(products.customAttentionThreshold)
          )
        );

      const productIds = productsUsingDefaults.map((p) => p.id);
      if (productIds.length > 0) {
        await recomputeAlertsForProducts(ctx.db, ctx.tenantId!, productIds);
      }

      return updated;
    }),
});
