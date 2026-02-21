import { TRPCError } from "@trpc/server";
import { eq, and, isNull } from "drizzle-orm";

import {
  tenantDefaultThresholdsOutputSchema,
  updateTenantDefaultThresholdsInputSchema,
} from "~/schemas/tenant-thresholds";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { canManageTenantMembers } from "~/server/auth/rbac-policy";
import type { db as rootDb } from "~/server/db";
import { products, tenants } from "~/server/db/schema";
import { recomputeAlertsForProducts } from "~/server/services/alert-service";

function assertTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  }

  return tenantId;
}

async function getMembershipOrThrow(input: {
  tenantId: string;
  userId: string;
  db: Pick<typeof rootDb, "query">;
}) {
  const membership = await input.db.query.tenantMemberships.findFirst({
    columns: {
      role: true,
    },
    where: (memberships, { and, eq }) =>
      and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId)),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active tenant membership is required for this operation.",
    });
  }

  return membership;
}

export const tenantThresholdsRouter = createTRPCRouter({
  getTenantDefaultThresholds: protectedProcedure
    .output(tenantDefaultThresholdsOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = assertTenantId(ctx.tenantId);

      await getMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      const [tenant] = await ctx.db
        .select({
          criticalThreshold: tenants.defaultCriticalThreshold,
          attentionThreshold: tenants.defaultAttentionThreshold,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      return tenant;
    }),

  updateTenantDefaultThresholds: protectedProcedure
    .input(updateTenantDefaultThresholdsInputSchema)
    .output(tenantDefaultThresholdsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = assertTenantId(ctx.tenantId);

      const membership = await getMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      if (!canManageTenantMembers(membership.role)) {
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
        .where(eq(tenants.id, tenantId))
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
            eq(products.tenantId, tenantId),
            isNull(products.deletedAt),
            isNull(products.customCriticalThreshold),
            isNull(products.customAttentionThreshold)
          )
        );

      const productIds = productsUsingDefaults.map((p) => p.id);
      if (productIds.length > 0) {
        await recomputeAlertsForProducts(ctx.db, tenantId, productIds);
      }

      return updated;
    }),
});
