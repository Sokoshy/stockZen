import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alerts, products, tenantMemberships, tenants, user } from "~/server/db/schema";
import { logger } from "~/server/logger";
import {
  buildProductUrl,
  queueCriticalAlertEmails,
  type CriticalAlertEmailRecipient,
} from "~/server/services/critical-alert-email";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";
import type { AlertLevel } from "~/schemas/alerts";

type AlertDbClient = PostgresJsDatabase<typeof schema>;

export const SNOOZE_DURATION_HOURS = 8;

export interface EffectiveThresholds {
  criticalThreshold: number;
  attentionThreshold: number;
  mode: "defaults" | "custom";
}

export interface ProductWithThresholds {
  name?: string;
  quantity: number;
  customCriticalThreshold: number | null;
  customAttentionThreshold: number | null;
}

export interface TenantThresholds {
  defaultCriticalThreshold: number;
  defaultAttentionThreshold: number;
}

export function isAlertSnoozed(snoozedUntil: Date | null, now: Date): boolean {
  return snoozedUntil !== null && snoozedUntil > now;
}

export function calculateSnoozeExpiry(now: Date): Date {
  return new Date(now.getTime() + SNOOZE_DURATION_HOURS * 60 * 60 * 1000);
}

export function shouldCancelSnoozeOnWorsening(
  currentLevel: AlertLevel,
  newLevel: AlertLevel
): boolean {
  return currentLevel === "orange" && newLevel === "red";
}

export function shouldTriggerCriticalNotification(
  previousLevel: AlertLevel | null,
  newLevel: AlertLevel
): boolean {
  if (newLevel !== "red") {
    return false;
  }
  return previousLevel !== "red";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
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
  pendingCriticalNotifications?: CriticalAlertNotificationTask[];
}

export interface CriticalAlertNotificationTask {
  tenantId: string;
  productId: string;
  productName: string;
  currentStock: number;
}

export async function resolveTenantMembersForCriticalAlert(
  db: AlertDbClient,
  tenantId: string
): Promise<CriticalAlertEmailRecipient[]> {
  const memberships = await db
    .select({
      userId: tenantMemberships.userId,
      email: user.email,
    })
    .from(tenantMemberships)
    .innerJoin(user, eq(tenantMemberships.userId, user.id))
    .where(eq(tenantMemberships.tenantId, tenantId));

  return memberships.map((m) => ({
    userId: m.userId,
    email: m.email,
  }));
}

export async function dispatchCriticalAlertNotification(
  db: AlertDbClient,
  task: CriticalAlertNotificationTask
): Promise<void> {
  const { tenantId, productId, productName, currentStock } = task;
  const recipients = await resolveTenantMembersForCriticalAlert(db, tenantId);

  if (recipients.length === 0) {
    logger.info(
      { tenantId, productId },
      "No active tenant members to notify for critical alert"
    );
    return;
  }

  const productUrl = buildProductUrl(productId);

  queueCriticalAlertEmails(recipients, {
    productName,
    productId,
    currentStock,
    alertLevel: "red",
    productUrl,
  });

  logger.info(
    { tenantId, productId, recipientCount: recipients.length },
    "Critical alert notification queued"
  );
}

export async function flushPendingCriticalAlertNotifications(
  db: AlertDbClient,
  notifications: CriticalAlertNotificationTask[]
): Promise<void> {
  for (const notification of notifications) {
    try {
      await dispatchCriticalAlertNotification(db, notification);
    } catch (error) {
      logger.error(
        {
          tenantId: notification.tenantId,
          productId: notification.productId,
          reason: error instanceof Error ? error.message : "unknown",
        },
        "Critical alert notification dispatch failed"
      );
    }
  }
}

async function queueOrDispatchCriticalAlertNotification(
  db: AlertDbClient,
  notification: CriticalAlertNotificationTask,
  pendingNotifications?: CriticalAlertNotificationTask[]
): Promise<void> {
  if (pendingNotifications) {
    pendingNotifications.push(notification);
    return;
  }

  await dispatchCriticalAlertNotification(db, notification);
}

export async function updateAlertLifecycle(
  input: UpdateAlertLifecycleInput
): Promise<void> {
  const {
    db,
    tenantId,
    productId,
    currentStock,
    productSnapshot,
    tenantThresholds,
    pendingCriticalNotifications,
  } = input;

  const product =
    productSnapshot ??
    (await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
      columns: {
        name: true,
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
          handledAt: null,
          snoozedUntil: null,
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

  if (existingActiveAlert) {
    const snoozed = isAlertSnoozed(existingActiveAlert.snoozedUntil, new Date());

    if (snoozed && shouldCancelSnoozeOnWorsening(existingActiveAlert.level, newLevel)) {
      await db
        .update(alerts)
        .set({
          level: "red",
          currentStock,
          snoozedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(alerts.id, existingActiveAlert.id));

      logger.info(
        { alertId: existingActiveAlert.id, productId, tenantId, newLevel: "red" },
        "Snooze cancelled - alert worsened from orange to red"
      );

      if (shouldTriggerCriticalNotification(existingActiveAlert.level, newLevel)) {
        await queueOrDispatchCriticalAlertNotification(
          db,
          {
            tenantId,
            productId,
            productName: product.name ?? "Unknown Product",
            currentStock,
          },
          pendingCriticalNotifications
        );
      }
      return;
    }

    await db
      .update(alerts)
      .set({
        level: newLevel,
        currentStock,
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, existingActiveAlert.id));

    logger.info(
      { alertId: existingActiveAlert.id, productId, tenantId, level: newLevel },
      "Alert updated"
    );

    if (shouldTriggerCriticalNotification(existingActiveAlert.level, newLevel)) {
      await queueOrDispatchCriticalAlertNotification(
        db,
        {
          tenantId,
          productId,
          productName: product.name ?? "Unknown Product",
          currentStock,
        },
        pendingCriticalNotifications
      );
    }
    return;
  }

  try {
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
      .returning();

    if (upsertedAlert) {
      logger.info(
        { alertId: upsertedAlert.id, productId, tenantId, level: newLevel },
        "New alert created"
      );

      if (shouldTriggerCriticalNotification(null, newLevel)) {
        await queueOrDispatchCriticalAlertNotification(
          db,
          {
            tenantId,
            productId,
            productName: product.name ?? "Unknown Product",
            currentStock,
          },
          pendingCriticalNotifications
        );
      }
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const concurrentActiveAlert = await db.query.alerts.findFirst({
      where: and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.productId, productId),
        eq(alerts.status, "active")
      ),
      columns: {
        id: true,
        level: true,
      },
    });

    if (!concurrentActiveAlert) {
      throw error;
    }

    const [updatedExistingAlert] = await db
      .update(alerts)
      .set({
        level: newLevel,
        currentStock,
        updatedAt: new Date(),
      })
      .where(
        eq(alerts.id, concurrentActiveAlert.id)
      )
      .returning({ id: alerts.id });

    if (!updatedExistingAlert) {
      throw error;
    }

    logger.info(
      { alertId: updatedExistingAlert.id, productId, tenantId, level: newLevel },
      "Concurrent alert creation resolved by updating active alert"
    );

    if (shouldTriggerCriticalNotification(concurrentActiveAlert.level, newLevel)) {
      await queueOrDispatchCriticalAlertNotification(
        db,
        {
          tenantId,
          productId,
          productName: product.name ?? "Unknown Product",
          currentStock,
        },
        pendingCriticalNotifications
      );
    }
  }
}

export async function recomputeAlertsForProducts(
  db: AlertDbClient,
  tenantId: string,
  productIds: string[],
  pendingCriticalNotifications?: CriticalAlertNotificationTask[]
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
    where: and(
      eq(products.tenantId, tenantId),
      inArray(products.id, productIds),
      isNull(products.deletedAt)
    ),
    columns: {
      id: true,
      name: true,
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
        name: product.name,
        quantity: product.quantity,
        customCriticalThreshold: product.customCriticalThreshold,
        customAttentionThreshold: product.customAttentionThreshold,
      },
      tenantThresholds: {
        defaultCriticalThreshold: tenant.defaultCriticalThreshold,
        defaultAttentionThreshold: tenant.defaultAttentionThreshold,
      },
      pendingCriticalNotifications,
    });
  }
}

export interface MarkHandledInput {
  db: AlertDbClient;
  tenantId: string;
  alertId: string;
}

export async function markHandled(input: MarkHandledInput): Promise<void> {
  const { db, tenantId, alertId } = input;

  const [updatedAlert] = await db
    .update(alerts)
    .set({
      status: "closed",
      handledAt: new Date(),
      snoozedUntil: null,
      updatedAt: new Date(),
      closedAt: new Date(),
    })
    .where(
      and(
        eq(alerts.id, alertId),
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, "active")
      )
    )
    .returning({ id: alerts.id });

  if (updatedAlert) {
    logger.info({ alertId, tenantId }, "Alert marked as handled");
    return;
  }

  const existingAlert = await db.query.alerts.findFirst({
    where: and(eq(alerts.id, alertId), eq(alerts.tenantId, tenantId)),
    columns: { id: true, status: true },
  });

  if (!existingAlert) {
    throw new Error("NOT_FOUND");
  }

  throw new Error("BAD_REQUEST");
}

export interface SnoozeAlertInput {
  db: AlertDbClient;
  tenantId: string;
  alertId: string;
}

export async function snoozeForEightHours(input: SnoozeAlertInput): Promise<void> {
  const { db, tenantId, alertId } = input;

  const snoozedUntil = calculateSnoozeExpiry(new Date());

  const [updatedAlert] = await db
    .update(alerts)
    .set({
      snoozedUntil,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(alerts.id, alertId),
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, "active")
      )
    )
    .returning({ id: alerts.id });

  if (updatedAlert) {
    logger.info({ alertId, tenantId, snoozedUntil }, "Alert snoozed for 8 hours");
    return;
  }

  const existingAlert = await db.query.alerts.findFirst({
    where: and(eq(alerts.id, alertId), eq(alerts.tenantId, tenantId)),
    columns: { id: true, status: true },
  });

  if (!existingAlert) {
    throw new Error("NOT_FOUND");
  }

  throw new Error("BAD_REQUEST");
}

export interface ListActiveAlertsInput {
  db: AlertDbClient;
  tenantId: string;
}

export interface ActiveAlertOutput {
  id: string;
  productId: string;
  productName: string;
  level: AlertLevel;
  currentStock: number;
  snoozedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listActiveAlerts(
  input: ListActiveAlertsInput
): Promise<ActiveAlertOutput[]> {
  const { db, tenantId } = input;

  const activeAlerts = await db
    .select({
      id: alerts.id,
      productId: alerts.productId,
      productName: products.name,
      level: alerts.level,
      currentStock: alerts.currentStock,
      snoozedUntil: alerts.snoozedUntil,
      createdAt: alerts.createdAt,
      updatedAt: alerts.updatedAt,
    })
    .from(alerts)
    .innerJoin(products, eq(alerts.productId, products.id))
    .where(
      and(
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, "active"),
        or(
          isNull(alerts.snoozedUntil),
          sql`${alerts.snoozedUntil} <= now()`
        )
      )
    )
    .orderBy(
      sql`case
        when ${alerts.level} = 'red' then 0
        when ${alerts.level} = 'orange' then 1
        else 2
      end`,
      desc(alerts.updatedAt)
    );

  return activeAlerts;
}

export const alertService = {
  updateAlertLifecycle,
  recomputeAlertsForProducts,
  resolveEffectiveThresholds,
  classifyAlertLevel,
  markHandled,
  snoozeForEightHours,
  listActiveAlerts,
  isAlertSnoozed,
  calculateSnoozeExpiry,
  shouldCancelSnoozeOnWorsening,
  shouldTriggerCriticalNotification,
  resolveTenantMembersForCriticalAlert,
  dispatchCriticalAlertNotification,
  flushPendingCriticalAlertNotifications,
};
