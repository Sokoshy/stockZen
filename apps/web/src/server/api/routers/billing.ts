import { TRPCError } from "@trpc/server";

import {
  billingOverviewOutputSchema,
  currentSubscriptionOutputSchema,
  currentUsageOutputSchema,
} from "~/schemas/billing";
import { isAdminRole } from "~/server/auth/rbac-policy";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getCurrentSubscription,
  getCurrentUsage,
} from "~/server/services/subscription-service";

function assertTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context is required for billing access.",
    });
  }

  return tenantId;
}

async function getMembershipOrThrow(input: {
  db: Parameters<typeof getCurrentSubscription>[0]["db"];
  tenantId: string;
  userId: string;
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
      message: "Active tenant membership is required for billing access.",
    });
  }

  return membership;
}

export const billingRouter = createTRPCRouter({
  current: protectedProcedure.output(currentSubscriptionOutputSchema).query(async ({ ctx }) => {
    const tenantId = assertTenantId(ctx.tenantId);
    const membership = await getMembershipOrThrow({
      db: ctx.db,
      tenantId,
      userId: ctx.session.user.id,
    });

    void membership;

    return getCurrentSubscription({
      db: ctx.db,
      tenantId,
    });
  }),

  usage: protectedProcedure.output(currentUsageOutputSchema).query(async ({ ctx }) => {
    const tenantId = assertTenantId(ctx.tenantId);
    const membership = await getMembershipOrThrow({
      db: ctx.db,
      tenantId,
      userId: ctx.session.user.id,
    });

    void membership;

    return getCurrentUsage({
      db: ctx.db,
      tenantId,
    });
  }),

  overview: protectedProcedure.output(billingOverviewOutputSchema).query(async ({ ctx }) => {
    const tenantId = assertTenantId(ctx.tenantId);
    const membership = await getMembershipOrThrow({
      db: ctx.db,
      tenantId,
      userId: ctx.session.user.id,
    });

    const [subscription, usage] = await Promise.all([
      getCurrentSubscription({
        db: ctx.db,
        tenantId,
      }),
      getCurrentUsage({
        db: ctx.db,
        tenantId,
      }),
    ]);

    return {
      actorRole: membership.role,
      canManagePlan: isAdminRole(membership.role),
      subscription,
      usage,
    };
  }),
});
