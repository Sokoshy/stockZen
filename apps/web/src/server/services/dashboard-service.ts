import { and, eq, isNull, or, sql } from "drizzle-orm";
import { alerts, products, tenants } from "~/server/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

type DashboardDbClient = PostgresJsDatabase<typeof schema>;

function clamp(min: number, max: number, value: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculatePMI(
  totalProducts: number,
  redAlertCount: number,
  orangeAlertCount: number
): number {
  if (totalProducts === 0) {
    return 100;
  }

  const percentRed = redAlertCount / totalProducts;
  const percentOrange = orangeAlertCount / totalProducts;

  const rawPMI = 100 - (percentRed * 40 + percentOrange * 15);
  return clamp(0, 100, Math.round(rawPMI));
}

export interface DashboardStatsInput {
  db: DashboardDbClient;
  tenantId: string;
}

export interface DashboardStatsOutput {
  totalProducts: number;
  activeAlertsCount: number;
  pmi: number | null;
}

export async function getDashboardStats(
  input: DashboardStatsInput
): Promise<DashboardStatsOutput> {
  const { db, tenantId } = input;

  const tenantProductCondition = and(
    eq(products.tenantId, tenantId),
    isNull(products.deletedAt)
  );

  const [distributionResult] = await db
    .select({
      totalProducts: sql<number>`count(*)`,
      redProductCount: sql<number>`coalesce(sum(case when ${products.quantity} <= coalesce(${products.customCriticalThreshold}, ${tenants.defaultCriticalThreshold}) then 1 else 0 end), 0)`,
      orangeProductCount: sql<number>`coalesce(sum(case when ${products.quantity} > coalesce(${products.customCriticalThreshold}, ${tenants.defaultCriticalThreshold}) and ${products.quantity} <= coalesce(${products.customAttentionThreshold}, ${tenants.defaultAttentionThreshold}) then 1 else 0 end), 0)`,
    })
    .from(products)
    .innerJoin(tenants, eq(products.tenantId, tenants.id))
    .where(tenantProductCondition);

  const totalProducts = Number(distributionResult?.totalProducts ?? 0);
  const redProductCount = Number(distributionResult?.redProductCount ?? 0);
  const orangeProductCount = Number(distributionResult?.orangeProductCount ?? 0);

  const activeAlertCondition = and(
    eq(alerts.tenantId, tenantId),
    eq(alerts.status, "active"),
    or(isNull(alerts.snoozedUntil), sql`${alerts.snoozedUntil} <= now()`)
  );

  const [redAlertsResult, orangeAlertsResult] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(activeAlertCondition!, eq(alerts.level, "red"))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(activeAlertCondition!, eq(alerts.level, "orange"))),
  ]);

  const redAlertCount = Number(redAlertsResult[0]?.count ?? 0);
  const orangeAlertCount = Number(orangeAlertsResult[0]?.count ?? 0);

  const activeAlertsCount = redAlertCount + orangeAlertCount;

  const pmi = calculatePMI(totalProducts, redProductCount, orangeProductCount);

  return {
    totalProducts,
    activeAlertsCount,
    pmi,
  };
}
