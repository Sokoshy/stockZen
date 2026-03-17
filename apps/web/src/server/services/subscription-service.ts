import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { SubscriptionPlan, SubscriptionLimits } from "~/schemas/billing";
import * as schema from "~/server/db/schema";
import { products, tenantMemberships, tenants } from "~/server/db/schema";

type SubscriptionDbClient = PostgresJsDatabase<typeof schema>;

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
