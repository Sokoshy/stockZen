import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { SubscriptionPlan, SubscriptionLimits } from "~/schemas/billing";
import * as schema from "~/server/db/schema";
import { products, tenantInvitations, tenantMemberships, tenants } from "~/server/db/schema";

type SubscriptionDbClient = PostgresJsDatabase<typeof schema>;

export const BILLING_UPGRADE_ROUTE = "/settings/billing";

export const PLAN_LIMITS: Record<SubscriptionPlan, SubscriptionLimits> = {
  Free: { maxProducts: 20, maxUsers: 1 },
  Starter: { maxProducts: 50, maxUsers: 2 },
  Pro: { maxProducts: 150, maxUsers: 3 },
};

export interface CurrentSubscriptionInput {
  db: SubscriptionDbClient;
  tenantId: string;
}

export interface CurrentUsageInput {
  db: SubscriptionDbClient;
  tenantId: string;
}

export interface PendingInvitationUsageInput {
  db: SubscriptionDbClient;
  tenantId: string;
}

export function getPlanLimits(plan: SubscriptionPlan): SubscriptionLimits {
  return PLAN_LIMITS[plan];
}

export async function getCurrentSubscription(input: CurrentSubscriptionInput) {
  const tenantRecord = await input.db.query.tenants.findFirst({
    columns: {
      subscriptionPlan: true,
    },
    where: eq(tenants.id, input.tenantId),
  });

  const plan = tenantRecord?.subscriptionPlan ?? "Free";

  return {
    plan,
    limits: getPlanLimits(plan),
    source: tenantRecord?.subscriptionPlan ? ("tenant" as const) : ("default" as const),
  };
}

export async function getCurrentUsage(input: CurrentUsageInput) {
  const { db, tenantId } = input;

  const [productResult, userResult] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId)),
  ]);

  return {
    productCount: Number(productResult[0]?.count ?? 0),
    userCount: Number(userResult[0]?.count ?? 0),
  };
}

export async function getPendingInvitationUsage(input: PendingInvitationUsageInput) {
  const pendingInvitationResult = await input.db
    .select({ count: sql<number>`count(*)` })
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.tenantId, input.tenantId),
        isNull(tenantInvitations.revokedAt),
        isNull(tenantInvitations.usedAt),
        gt(tenantInvitations.expiresAt, new Date())
      )
    );

  return Number(pendingInvitationResult[0]?.count ?? 0);
}

export async function lockTenantSubscription(input: LimitCheckInput) {
  await input.db.execute(sql`
    select ${tenants.id}
    from ${tenants}
    where ${tenants.id} = ${input.tenantId}
    for update
  `);
}

export interface LimitCheckInput {
  db: SubscriptionDbClient;
  tenantId: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  plan: SubscriptionPlan;
  upgradeRoute?: string;
}

export async function checkProductLimit(input: LimitCheckInput): Promise<LimitCheckResult> {
  const [subscription, usage] = await Promise.all([
    getCurrentSubscription(input),
    getCurrentUsage(input),
  ]);

  const limit = subscription.limits.maxProducts;
  const remaining = limit - usage.productCount;
  const allowed = remaining > 0;

  return {
    allowed,
    currentCount: usage.productCount,
    limit,
    plan: subscription.plan,
    upgradeRoute: !allowed ? BILLING_UPGRADE_ROUTE : undefined,
  };
}

export async function checkUserLimit(input: LimitCheckInput): Promise<LimitCheckResult> {
  const [subscription, usage, pendingInvitationCount] = await Promise.all([
    getCurrentSubscription(input),
    getCurrentUsage(input),
    getPendingInvitationUsage(input),
  ]);

  const limit = subscription.limits.maxUsers;
  const reservedSeats = usage.userCount + pendingInvitationCount;
  const remaining = limit - reservedSeats;
  const allowed = remaining > 0;

  return {
    allowed,
    currentCount: reservedSeats,
    limit,
    plan: subscription.plan,
    upgradeRoute: !allowed ? BILLING_UPGRADE_ROUTE : undefined,
  };
}
