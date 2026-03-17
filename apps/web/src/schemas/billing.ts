import { z } from "zod";

import { tenantRoleSchema } from "~/schemas/team-membership";

export const subscriptionPlanSchema = z.enum(["Free", "Starter", "Pro"]);

export const subscriptionLimitsSchema = z.object({
  maxProducts: z.number().int().positive(),
  maxUsers: z.number().int().positive(),
});

export const currentSubscriptionOutputSchema = z.object({
  plan: subscriptionPlanSchema,
  limits: subscriptionLimitsSchema,
  source: z.enum(["default", "tenant"]),
});

export const currentUsageOutputSchema = z.object({
  productCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
});

export const billingOverviewOutputSchema = z.object({
  actorRole: tenantRoleSchema,
  canManagePlan: z.boolean(),
  subscription: currentSubscriptionOutputSchema,
  usage: currentUsageOutputSchema,
});

export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export type SubscriptionLimits = z.infer<typeof subscriptionLimitsSchema>;
export type CurrentSubscriptionOutput = z.infer<typeof currentSubscriptionOutputSchema>;
export type CurrentUsageOutput = z.infer<typeof currentUsageOutputSchema>;
export type BillingOverviewOutput = z.infer<typeof billingOverviewOutputSchema>;
