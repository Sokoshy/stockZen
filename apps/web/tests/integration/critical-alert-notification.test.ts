// @vitest-environment node

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alerts, products, tenantMemberships } from "~/server/db/schema";
import {
  recomputeAlertsForProducts,
  snoozeForEightHours,
  type CriticalAlertNotificationTask,
  updateAlertLifecycle,
  resolveTenantMembersForCriticalAlert,
} from "~/server/services/alert-service";
import {
  addUserToTenantWithRole,
  cleanTestDatabase,
  createTenantContext,
  createTestTenant,
  testDb,
} from "../helpers/tenant-test-factories";

describe("Critical Alert Notification Integration Tests", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveTenantMembersForCriticalAlert", () => {
    it("returns all active tenant members across all roles", async () => {
      const admin = await createTestTenant();
      const manager = await addUserToTenantWithRole(admin.tenantId, "Manager");
      const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

      const recipients = await resolveTenantMembersForCriticalAlert(testDb, admin.tenantId);

      expect(recipients).toHaveLength(3);
      const emails = recipients.map((r) => r.email);
      expect(emails).toContain(admin.email);
      expect(emails).toContain(manager.email);
      expect(emails).toContain(operator.email);
    });

    it("excludes removed members", async () => {
      const admin = await createTestTenant();
      const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

      await testDb
        .delete(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, admin.tenantId),
            eq(tenantMemberships.userId, operator.userId)
          )
        );

      const recipients = await resolveTenantMembersForCriticalAlert(testDb, admin.tenantId);

      expect(recipients).toHaveLength(1);
      expect(recipients[0]?.email).toBe(admin.email);
    });

    it("returns empty array for tenant with no members", async () => {
      const admin = await createTestTenant();

      await testDb
        .delete(tenantMemberships)
        .where(eq(tenantMemberships.tenantId, admin.tenantId));

      const recipients = await resolveTenantMembersForCriticalAlert(testDb, admin.tenantId);

      expect(recipients).toHaveLength(0);
    });
  });

  describe("notification trigger on non-red to red transitions", () => {
    it("collects one notification with product details when product first becomes red", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 150,
      });

      const pendingNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
        pendingCriticalNotifications: pendingNotifications,
      });

      const alert = await testDb.query.alerts.findFirst({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.productId, product.id)),
      });
      expect(alert?.level).toBe("red");
      expect(pendingNotifications).toHaveLength(1);
      expect(pendingNotifications[0]).toMatchObject({
        tenantId: admin.tenantId,
        productId: product.id,
        productName: "Test Product",
        currentStock: 30,
      });
    });

    it("collects one notification when product goes from orange to red", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 75,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 75,
      });

      const pendingNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 40,
        pendingCriticalNotifications: pendingNotifications,
      });

      const redAlert = await testDb.query.alerts.findFirst({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.productId, product.id)),
      });
      expect(redAlert?.level).toBe("red");
      expect(pendingNotifications).toHaveLength(1);
      expect(pendingNotifications[0]?.productName).toBe("Test Product");
    });

    it("does NOT collect duplicate notification when alert stays red across updates", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 150,
      });

      const firstNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
        pendingCriticalNotifications: firstNotifications,
      });

      const redAlert = await testDb.query.alerts.findFirst({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.productId, product.id)),
      });
      expect(redAlert?.level).toBe("red");

      const secondNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
        pendingCriticalNotifications: secondNotifications,
      });

      expect(firstNotifications).toHaveLength(1);
      expect(secondNotifications).toHaveLength(0);
    });

    it("collects notification again after alert leaves red and returns to red", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 150,
      });

      const firstNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
        pendingCriticalNotifications: firstNotifications,
      });

      const redAlert1 = await testDb.query.alerts.findFirst({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.productId, product.id)),
      });
      expect(redAlert1?.level).toBe("red");

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 150,
      });

      const closedAlert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, redAlert1!.id),
      });
      expect(closedAlert?.status).toBe("closed");

      const secondNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 20,
        pendingCriticalNotifications: secondNotifications,
      });

      expect(firstNotifications).toHaveLength(1);
      expect(secondNotifications).toHaveLength(1);
    });
  });

  describe("snooze cancellation and notification", () => {
    it("collects notification when snoozed orange alert worsens to red", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 75,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 75,
      });

      const orangeAlert = await testDb.query.alerts.findFirst({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.productId, product.id)),
      });
      expect(orangeAlert?.level).toBe("orange");

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: orangeAlert!.id,
      });

      const pendingNotifications: CriticalAlertNotificationTask[] = [];

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 40,
        pendingCriticalNotifications: pendingNotifications,
      });

      const updatedAlert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, orangeAlert!.id),
      });

      expect(updatedAlert?.level).toBe("red");
      expect(updatedAlert?.snoozedUntil).toBeNull();
      expect(pendingNotifications).toHaveLength(1);
    });
  });

  describe("recomputeAlertsForProducts", () => {
    it("uses product name in queued critical notification payload", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Default Threshold Product",
        category: "Test",
        price: 100,
        quantity: 150,
      });

      await testDb
        .update(products)
        .set({ quantity: 25, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), eq(products.tenantId, admin.tenantId)));

      const pendingNotifications: CriticalAlertNotificationTask[] = [];

      await recomputeAlertsForProducts(
        testDb,
        admin.tenantId,
        [product.id],
        pendingNotifications
      );

      expect(pendingNotifications).toHaveLength(1);
      expect(pendingNotifications[0]?.productName).toBe("Default Threshold Product");
      expect(pendingNotifications[0]?.productId).toBe(product.id);
      expect(pendingNotifications[0]?.tenantId).toBe(admin.tenantId);
    });
  });

  describe("tenant isolation for notifications", () => {
    it("does not include members from other tenants", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      await addUserToTenantWithRole(tenantA.tenantId, "Manager");
      await addUserToTenantWithRole(tenantB.tenantId, "Operator");

      const recipientsA = await resolveTenantMembersForCriticalAlert(testDb, tenantA.tenantId);
      const recipientsB = await resolveTenantMembersForCriticalAlert(testDb, tenantB.tenantId);

      const emailsA = recipientsA.map((r) => r.email);
      const emailsB = recipientsB.map((r) => r.email);

      for (const email of emailsA) {
        expect(emailsB).not.toContain(email);
      }
    });
  });
});
