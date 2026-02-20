import { and, eq, inArray } from "drizzle-orm";
import { alerts, products, tenants } from "~/server/db/schema";
import { logger } from "~/server/logger";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";
import type { AlertLevel } from "~/schemas/alerts";

type AlertDbClient = PostgresJsDatabase<typeof schema>;

export interface EffectiveThresholds {
  criticalThreshold: number;
  attentionThreshold: number;
  mode: "defaults" | "custom";
}

export interface ProductWithThresholds {
  quantity: number;
  customCriticalThreshold: number | null;
  customAttentionThreshold: number | null;
}

export interface TenantThresholds {
  defaultCriticalThreshold: number;
  defaultAttentionThreshold: number;
}

export function resolveEffectiveThresholds(
  product: ProductWithThresholds,
  tenantThresholds: TenantThresholds
): EffectiveThresholds {
  const hasValidCustomPair =
    typeof product.customCriticalThreshold === "number" &&
    Number.isInteger(product.customCriticalThreshold) &&
    product.customCriticalThreshold > 0 &&
    typeof product.customAttentionThreshold === "number" &&
    Number.isInteger(product.customAttentionThreshold) &&
    product.customAttentionThreshold > 0 &&
    product.customCriticalThreshold < product.customAttentionThreshold;

  if (hasValidCustomPair) {
    return {
      criticalThreshold: product.customCriticalThreshold as number,
      attentionThreshold: product.customAttentionThreshold as number,
      mode: "custom",
    };
  }

  return {
    criticalThreshold: tenantThresholds.defaultCriticalThreshold,
    attentionThreshold: tenantThresholds.defaultAttentionThreshold,
    mode: "defaults",
  };
}

export function classifyAlertLevel(
  stock: number,
  criticalThreshold: number,
  attentionThreshold: number
): AlertLevel {
  if (stock <= criticalThreshold) {
    return "red";
  }
  if (stock <= attentionThreshold) {
    return "orange";
  }
  return "green";
}

export interface UpdateAlertLifecycleInput {
  db: AlertDbClient;
  tenantId: string;
  productId: string;
  currentStock: number;
  productSnapshot?: ProductWithThresholds;
  tenantThresholds?: TenantThresholds;
}

export async function updateAlertLifecycle(
  input: UpdateAlertLifecycleInput
): Promise<void> {
  const { db, tenantId, productId, currentStock, productSnapshot, tenantThresholds } = input;

  const product =
    productSnapshot ??
    (await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
      columns: {
        quantity: true,
        customCriticalThreshold: true,
        customAttentionThreshold: true,
      },
    }));

  const tenant =
    tenantThresholds ??
    (await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: {
        defaultCriticalThreshold: true,
        defaultAttentionThreshold: true,
      },
    }));

  if (!product || !tenant) {
    logger.warn(
      { tenantId, productId },
      "Product or tenant not found for alert lifecycle update"
    );
    return;
  }

  const thresholds = resolveEffectiveThresholds(
    {
      quantity: product.quantity,
      customCriticalThreshold: product.customCriticalThreshold,
      customAttentionThreshold: product.customAttentionThreshold,
    },
    {
      defaultCriticalThreshold: tenant.defaultCriticalThreshold,
      defaultAttentionThreshold: tenant.defaultAttentionThreshold,
    }
  );

  const newLevel = classifyAlertLevel(
    currentStock,
    thresholds.criticalThreshold,
    thresholds.attentionThreshold
  );

  const existingActiveAlert = await db.query.alerts.findFirst({
    where: and(
      eq(alerts.tenantId, tenantId),
      eq(alerts.productId, productId),
      eq(alerts.status, "active")
    ),
  });

  if (newLevel === "green") {
    if (existingActiveAlert) {
      await db
        .update(alerts)
        .set({
          status: "closed",
          currentStock,
          updatedAt: new Date(),
          closedAt: new Date(),
        })
        .where(eq(alerts.id, existingActiveAlert.id));

      logger.info(
        { alertId: existingActiveAlert.id, productId, tenantId },
        "Alert closed - product returned to green"
      );
    }
    return;
  }

  const [upsertedAlert] = await db
    .insert(alerts)
    .values({
      tenantId,
      productId,
      level: newLevel,
      status: "active",
      stockAtCreation: currentStock,
      currentStock,
    })
    .onConflictDoUpdate({
      target: [alerts.tenantId, alerts.productId],
      targetWhere: eq(alerts.status, "active"),
      set: {
        level: newLevel,
        currentStock,
        updatedAt: new Date(),
        closedAt: null,
      },
    })
    .returning();

  if (upsertedAlert) {
    logger.info(
      { alertId: upsertedAlert.id, productId, tenantId, level: newLevel },
      existingActiveAlert ? "Alert updated" : "New alert created"
    );
  }
}

export async function recomputeAlertsForProducts(
  db: AlertDbClient,
  tenantId: string,
  productIds: string[]
): Promise<void> {
  if (productIds.length === 0) {
    return;
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      defaultCriticalThreshold: true,
      defaultAttentionThreshold: true,
    },
  });

  if (!tenant) {
    logger.warn({ tenantId }, "Tenant not found for alert recomputation");
    return;
  }

  const tenantProducts = await db.query.products.findMany({
    where: and(eq(products.tenantId, tenantId), inArray(products.id, productIds)),
    columns: {
      id: true,
      quantity: true,
      customCriticalThreshold: true,
      customAttentionThreshold: true,
    },
  });

  for (const product of tenantProducts) {
    await updateAlertLifecycle({
      db,
      tenantId,
      productId: product.id,
      currentStock: product.quantity,
      productSnapshot: {
        quantity: product.quantity,
        customCriticalThreshold: product.customCriticalThreshold,
        customAttentionThreshold: product.customAttentionThreshold,
      },
      tenantThresholds: {
        defaultCriticalThreshold: tenant.defaultCriticalThreshold,
        defaultAttentionThreshold: tenant.defaultAttentionThreshold,
      },
    });
  }
}

export const alertService = {
  updateAlertLifecycle,
  recomputeAlertsForProducts,
  resolveEffectiveThresholds,
  classifyAlertLevel,
};
