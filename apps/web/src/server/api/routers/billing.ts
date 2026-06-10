import {
  billingOverviewOutputSchema,
  currentSubscriptionOutputSchema,
  currentUsageOutputSchema,
} from "~/schemas/billing";
import { isAdminRole } from "~/server/auth/rbac-policy";
import { createTRPCRouter, membershipProcedure } from "~/server/api/trpc";
import {
  getCurrentSubscription,
  getCurrentUsage,
} from "~/server/services/subscription-service";

export const billingRouter = createTRPCRouter({
  current: membershipProcedure.output(currentSubscriptionOutputSchema).query(async ({ ctx }) => {
    return getCurrentSubscription({
      db: ctx.db,
      tenantId: ctx.tenantId!,
    });
  }),

  usage: membershipProcedure.output(currentUsageOutputSchema).query(async ({ ctx }) => {
    return getCurrentUsage({
      db: ctx.db,
      tenantId: ctx.tenantId!,
    });
  }),

  overview: membershipProcedure.output(billingOverviewOutputSchema).query(async ({ ctx }) => {
    const [subscription, usage] = await Promise.all([
      getCurrentSubscription({
        db: ctx.db,
        tenantId: ctx.tenantId!,
      }),
      getCurrentUsage({
        db: ctx.db,
        tenantId: ctx.tenantId!,
      }),
    ]);

    return {
      actorRole: ctx.membership.role,
      canManagePlan: isAdminRole(ctx.membership.role),
      subscription,
      usage,
    };
  }),
});
