// @vitest-environment node

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { alerts, products } from "~/server/db/schema";
import {
  addUserToTenantWithRole,
  cleanTestDatabase,
  createTenantContext,
  createTestTenant,
  testDb,
} from "../helpers/tenant-test-factories";

describe("Products CRUD", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it("updates editable product fields", async () => {
    const admin = await createTestTenant();
    const adminCtx = await createTenantContext(admin);

    const created = await adminCtx.caller.products.create({
      name: "Flour",
      category: "Raw Materials",
      unit: "kg",
      barcode: "FLOUR-001",
      price: 12,
      quantity: 50,
    });

    const updated = await adminCtx.caller.products.update({
      id: created.id,
      data: {
        name: "Flour T55",
        category: "Bakery",
        barcode: "FLOUR-002",
        price: 14,
      },
    });

    expect(updated.name).toBe("Flour T55");
    expect(updated.category).toBe("Bakery");
    expect(updated.barcode).toBe("FLOUR-002");
    expect(updated.price).toBe(14);
  });

  it("creates an active red alert when a new product starts below critical threshold", async () => {
    const admin = await createTestTenant();
    const adminCtx = await createTenantContext(admin);

    const created = await adminCtx.caller.products.create({
      name: "Low Stock Flour",
      category: "Raw Materials",
      unit: "kg",
      price: 12,
      quantity: 10,
    });

    const createdAlert = await testDb.query.alerts.findFirst({
      where: and(
        eq(alerts.tenantId, admin.tenantId),
        eq(alerts.productId, created.id),
        eq(alerts.status, "active")
      ),
    });

    expect(createdAlert).toBeDefined();
    expect(createdAlert?.level).toBe("red");
    expect(createdAlert?.currentStock).toBe(10);
  });

  it("soft deletes products and hides them from list", async () => {
    const admin = await createTestTenant();
    const adminCtx = await createTenantContext(admin);

    const created = await adminCtx.caller.products.create({
      name: "Butter",
      category: "Dairy",
      unit: "kg",
      price: 7,
      quantity: 20,
    });

    await adminCtx.caller.products.delete({ id: created.id });

    await expect(adminCtx.caller.products.getById({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const list = await adminCtx.caller.products.list();
    expect(list.products.some((product) => product.id === created.id)).toBe(false);

    const deletedRow = await testDb.query.products.findFirst({
      where: and(eq(products.id, created.id), eq(products.tenantId, admin.tenantId)),
    });

    expect(deletedRow).toBeDefined();
    expect(deletedRow?.deletedAt).not.toBeNull();
  });

  it("does not allow Operator to update purchasePrice", async () => {
    const admin = await createTestTenant();
    const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

    const adminCtx = await createTenantContext(admin);
    const operatorCtx = await createTenantContext(operator);

    const created = await adminCtx.caller.products.create({
      name: "Sugar",
      category: "Raw Materials",
      unit: "kg",
      price: 5,
      purchasePrice: 2,
      quantity: 10,
    });

    await operatorCtx.caller.products.update({
      id: created.id,
      data: {
        purchasePrice: 99,
      },
    });

    const stored = await testDb.query.products.findFirst({
      where: and(eq(products.id, created.id), eq(products.tenantId, admin.tenantId)),
    });

    expect(stored?.purchasePrice).toBe("2.00");
  });

  it("rejects invalid custom threshold update payloads", async () => {
    const admin = await createTestTenant();
    const adminCtx = await createTenantContext(admin);

    const created = await adminCtx.caller.products.create({
      name: "Yeast",
      category: "Raw Materials",
      unit: "g",
      price: 3,
      quantity: 10,
    });

    await expect(
      adminCtx.caller.products.update({
        id: created.id,
        data: {
          thresholdMode: "custom",
          customCriticalThreshold: 20,
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      adminCtx.caller.products.update({
        id: created.id,
        data: {
          customCriticalThreshold: 20,
          customAttentionThreshold: 40,
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
