// @vitest-environment node

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { alerts, products } from "~/server/db/schema";
import { markHandled, snoozeForEightHours, listActiveAlerts, updateAlertLifecycle } from "~/server/services/alert-service";
import {
  addUserToTenantWithRole,
  cleanTestDatabase,
  createTenantContext,
  createTestTenant,
  testDb,
} from "../helpers/tenant-test-factories";

describe("Alert Triage Integration Tests", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe("markHandled", () => {
    it("marks an active alert as handled", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlertsBefore = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });
      expect(activeAlertsBefore).toHaveLength(1);

      await markHandled({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlertsBefore[0]!.id,
      });

      const alert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, activeAlertsBefore[0]!.id),
      });

      expect(alert?.status).toBe("closed");
      expect(alert?.handledAt).not.toBeNull();
      expect(alert?.snoozedUntil).toBeNull();
    });

    it("allows reactivation after handled when product becomes non-green again", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });
      expect(activeAlerts).toHaveLength(1);

      await markHandled({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
      });

      const newActiveAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });
      expect(newActiveAlerts).toHaveLength(1);
      expect(newActiveAlerts[0]?.id).not.toBe(activeAlerts[0]?.id);
    });

    it("throws NOT_FOUND for non-existent alert", async () => {
      const admin = await createTestTenant();

      await expect(
        markHandled({
          db: testDb,
          tenantId: admin.tenantId,
          alertId: "00000000-0000-0000-0000-000000000000",
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws NOT_FOUND for cross-tenant alert", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const ctxA = await createTenantContext(tenantA);

      const product = await ctxA.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: tenantA.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, tenantA.tenantId), eq(alerts.status, "active")),
      });
      expect(activeAlerts).toHaveLength(1);

      await expect(
        markHandled({
          db: testDb,
          tenantId: tenantB.tenantId,
          alertId: activeAlerts[0]!.id,
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws BAD_REQUEST when trying to handle an already closed alert", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await markHandled({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      await expect(
        markHandled({
          db: testDb,
          tenantId: admin.tenantId,
          alertId: activeAlerts[0]!.id,
        })
      ).rejects.toThrow("BAD_REQUEST");
    });
  });

  describe("snoozeForEightHours", () => {
    it("sets snoozedUntil to 8 hours from now", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });
      expect(activeAlerts).toHaveLength(1);

      const before = Date.now();
      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });
      const after = Date.now();

      const alert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, activeAlerts[0]!.id),
      });

      const snoozedUntilTime = alert?.snoozedUntil?.getTime() ?? 0;
      const expectedMin = before + 8 * 60 * 60 * 1000;
      const expectedMax = after + 8 * 60 * 60 * 1000;

      expect(snoozedUntilTime).toBeGreaterThanOrEqual(expectedMin);
      expect(snoozedUntilTime).toBeLessThanOrEqual(expectedMax);
    });

    it("hides snoozed alert from active list", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      const visibleAlerts = await listActiveAlerts({
        db: testDb,
        tenantId: admin.tenantId,
        limit: 20,
      });

      expect(visibleAlerts.alerts).toHaveLength(0);
    });

    it("throws NOT_FOUND for non-existent alert", async () => {
      const admin = await createTestTenant();

      await expect(
        snoozeForEightHours({
          db: testDb,
          tenantId: admin.tenantId,
          alertId: "00000000-0000-0000-0000-000000000000",
        })
      ).rejects.toThrow("NOT_FOUND");
    });

    it("throws BAD_REQUEST when trying to snooze a closed alert", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await markHandled({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      await expect(
        snoozeForEightHours({
          db: testDb,
          tenantId: admin.tenantId,
          alertId: activeAlerts[0]!.id,
        })
      ).rejects.toThrow("BAD_REQUEST");
    });
  });

  describe("snooze cancellation on worsening", () => {
    it("cancels snooze when alert worsens from orange to red", async () => {
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

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });
      expect(activeAlerts[0]?.level).toBe("orange");

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
      });

      const alert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, activeAlerts[0]!.id),
      });

      expect(alert?.level).toBe("red");
      expect(alert?.snoozedUntil).toBeNull();
    });

    it("immediately resurfaces alert as red when worsens during snooze", async () => {
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

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      const visibleBeforeSnooze = await listActiveAlerts({
        db: testDb,
        tenantId: admin.tenantId,
        limit: 20,
      });
      expect(visibleBeforeSnooze.alerts).toHaveLength(0);

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
      });

      const visibleAfterWorsen = await listActiveAlerts({
        db: testDb,
        tenantId: admin.tenantId,
        limit: 20,
      });
      expect(visibleAfterWorsen.alerts).toHaveLength(1);
      expect(visibleAfterWorsen.alerts[0]?.level).toBe("red");
    });
  });

  describe("green closure during snooze", () => {
    it("closes alert and clears triage metadata when product returns to green", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: activeAlerts[0]!.id,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 150,
      });

      const alert = await testDb.query.alerts.findFirst({
        where: eq(alerts.id, activeAlerts[0]!.id),
      });

      expect(alert?.status).toBe("closed");
      expect(alert?.closedAt).not.toBeNull();
      expect(alert?.snoozedUntil).toBeNull();
      expect(alert?.handledAt).toBeNull();
    });
  });

  describe("one-active-alert invariant with triage", () => {
    it("maintains unique active alert per product", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
      });

      const activeAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      expect(activeAlerts).toHaveLength(1);
    });

    it("allows new active alert after previous was handled", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product = await ctx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 30,
      });

      const firstAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await markHandled({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: firstAlerts[0]!.id,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product.id,
        currentStock: 25,
      });

      const allAlerts = await testDb.query.alerts.findMany({
        where: eq(alerts.productId, product.id),
      });

      expect(allAlerts).toHaveLength(2);
      expect(allAlerts.filter((a) => a.status === "active")).toHaveLength(1);
      expect(allAlerts.filter((a) => a.status === "closed")).toHaveLength(1);
    });
  });

  describe("listActiveAlerts via tRPC", () => {
    it("returns only non-snoozed alerts for tenant", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product1 = await ctx.caller.products.create({
        name: "Product 1",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      const product2 = await ctx.caller.products.create({
        name: "Product 2",
        category: "Test",
        price: 100,
        quantity: 20,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product1.id,
        currentStock: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product2.id,
        currentStock: 20,
      });

      const allAlerts = await testDb.query.alerts.findMany({
        where: and(eq(alerts.tenantId, admin.tenantId), eq(alerts.status, "active")),
      });

      await snoozeForEightHours({
        db: testDb,
        tenantId: admin.tenantId,
        alertId: allAlerts[0]!.id,
      });

      const result = await ctx.caller.alerts.listActive({});

      expect(result.alerts).toHaveLength(1);
    });

    it("allows all roles to list alerts", async () => {
      const admin = await createTestTenant();
      const manager = await addUserToTenantWithRole(admin.tenantId, "Manager");
      const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

      const adminCtx = await createTenantContext(admin);
      const managerCtx = await createTenantContext(manager);
      const operatorCtx = await createTenantContext(operator);

      await adminCtx.caller.products.create({
        name: "Test Product",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: (await testDb.query.products.findFirst({
          where: eq(products.tenantId, admin.tenantId),
        }))!.id,
        currentStock: 30,
      });

      const adminResult = await adminCtx.caller.alerts.listActive({});
      const managerResult = await managerCtx.caller.alerts.listActive({});
      const operatorResult = await operatorCtx.caller.alerts.listActive({});

      expect(adminResult.alerts).toHaveLength(1);
      expect(managerResult.alerts).toHaveLength(1);
      expect(operatorResult.alerts).toHaveLength(1);
    });

    it("returns alerts sorted by priority (red before orange)", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const orangeProduct = await ctx.caller.products.create({
        name: "Orange Product",
        category: "Test",
        price: 100,
        quantity: 75,
      });

      const redProduct = await ctx.caller.products.create({
        name: "Red Product",
        category: "Test",
        price: 100,
        quantity: 25,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: orangeProduct.id,
        currentStock: 75,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: redProduct.id,
        currentStock: 25,
      });

      const result = await ctx.caller.alerts.listActive({});
      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0]?.level).toBe("red");
      expect(result.alerts[1]?.level).toBe("orange");
    });

    it("sorts same-level alerts by urgency (lower stock first)", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const orangeLessUrgent = await ctx.caller.products.create({
        name: "Orange Less Urgent",
        category: "Test",
        price: 100,
        quantity: 90,
      });

      const orangeMoreUrgent = await ctx.caller.products.create({
        name: "Orange More Urgent",
        category: "Test",
        price: 100,
        quantity: 70,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: orangeLessUrgent.id,
        currentStock: 90,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: orangeMoreUrgent.id,
        currentStock: 70,
      });

      const result = await ctx.caller.alerts.listActive({});

      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0]?.currentStock).toBe(70);
      expect(result.alerts[1]?.currentStock).toBe(90);
    });

    it("paginates without duplicates across priority boundaries", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const redMostUrgent = await ctx.caller.products.create({
        name: "Red Most Urgent",
        category: "Test",
        price: 100,
        quantity: 10,
      });

      const redLessUrgent = await ctx.caller.products.create({
        name: "Red Less Urgent",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      const orangeMostUrgent = await ctx.caller.products.create({
        name: "Orange Most Urgent",
        category: "Test",
        price: 100,
        quantity: 70,
      });

      const orangeLessUrgent = await ctx.caller.products.create({
        name: "Orange Less Urgent",
        category: "Test",
        price: 100,
        quantity: 90,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: redMostUrgent.id,
        currentStock: 10,
      });
      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: redLessUrgent.id,
        currentStock: 30,
      });
      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: orangeMostUrgent.id,
        currentStock: 70,
      });
      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: orangeLessUrgent.id,
        currentStock: 90,
      });

      const allAlerts: Awaited<
        ReturnType<typeof ctx.caller.alerts.listActive>
      >["alerts"] = [];
      let cursor: string | undefined;

      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const page = await ctx.caller.alerts.listActive({
          cursor,
          limit: 2,
        });

        allAlerts.push(...page.alerts);

        if (!page.nextCursor) {
          break;
        }

        cursor = page.nextCursor;
      }

      const ids = allAlerts.map((alert) => alert.id);

      expect(allAlerts).toHaveLength(4);
      expect(new Set(ids).size).toBe(ids.length);
      expect(allAlerts.map((alert) => alert.level)).toEqual([
        "red",
        "red",
        "orange",
        "orange",
      ]);
      expect(allAlerts.map((alert) => alert.currentStock)).toEqual([10, 30, 70, 90]);
    });

    it("dashboard stats exclude currently snoozed alerts while PMI still reflects product health", async () => {
      const admin = await createTestTenant();
      const ctx = await createTenantContext(admin);

      const product1 = await ctx.caller.products.create({
        name: "Product 1",
        category: "Test",
        price: 100,
        quantity: 30,
      });

      const product2 = await ctx.caller.products.create({
        name: "Product 2",
        category: "Test",
        price: 100,
        quantity: 20,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product1.id,
        currentStock: 30,
      });

      await updateAlertLifecycle({
        db: testDb,
        tenantId: admin.tenantId,
        productId: product2.id,
        currentStock: 20,
      });

      const activeAlerts = await ctx.caller.alerts.listActive({});
      expect(activeAlerts.alerts).toHaveLength(2);

      await ctx.caller.alerts.snooze({ alertId: activeAlerts.alerts[0]!.id });

      const stats = await ctx.caller.dashboard.stats();
      expect(stats.totalProducts).toBe(2);
      expect(stats.activeAlertsCount).toBe(1);
      expect(stats.pmi).toBe(60);
    });
  });
});
