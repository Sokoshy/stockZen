import { and, eq, isNull, or, sql } from "drizzle-orm";
import { alerts, products } from "~/server/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

type DashboardDbClient = PostgresJsDatabase<typeof schema>;

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

  const productsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt)));

  const totalProducts = Number(productsResult[0]?.count ?? 0);

  const alertsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(alerts)
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, "active"),
        or(isNull(alerts.snoozedUntil), sql`${alerts.snoozedUntil} <= now()`)
      )
    );

  const activeAlertsCount = Number(alertsResult[0]?.count ?? 0);

  return {
    totalProducts,
    activeAlertsCount,
    pmi: null,
  };
}
