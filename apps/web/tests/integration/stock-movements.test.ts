// @vitest-environment node

import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { products, stockMovements } from "~/server/db/schema";
import {
  addUserToTenantWithRole,
  cleanTestDatabase,
  createTenantContext,
  createTestTenant,
  testDb,
} from "../helpers/tenant-test-factories";

describe("Stock movements API", () => {
  beforeEach(async () => {
    await cleanTestDatabase();

    await testDb.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE movement_type AS ENUM ('entry', 'exit');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await testDb.execute(sql`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        tenant_id uuid NOT NULL,
        product_id uuid NOT NULL,
        user_id text NOT NULL,
        type movement_type NOT NULL,
        quantity integer NOT NULL,
        idempotency_key varchar(255),
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    await testDb.execute(sql`DELETE FROM stock_movements;`);
  });

  it(
    "allows Admin, Manager, and Operator to record movements",
    async () => {
    const admin = await createTestTenant();
    const manager = await addUserToTenantWithRole(admin.tenantId, "Manager");
    const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

    const adminCtx = await createTenantContext(admin);
    const managerCtx = await createTenantContext(manager);
    const operatorCtx = await createTenantContext(operator);

    const createdProduct = await adminCtx.caller.products.create({
      name: "Flour",
      category: "Raw Materials",
      unit: "kg",
      price: 10,
      quantity: 10,
    });

    await adminCtx.caller.stockMovements.create({
      productId: createdProduct.id,
      type: "entry",
      quantity: 5,
    });

    await managerCtx.caller.stockMovements.create({
      productId: createdProduct.id,
      type: "exit",
      quantity: 3,
    });

    await operatorCtx.caller.stockMovements.create({
      productId: createdProduct.id,
      type: "entry",
      quantity: 2,
    });

    const product = await testDb.query.products.findFirst({
      where: and(eq(products.id, createdProduct.id), eq(products.tenantId, admin.tenantId)),
    });

    expect(product?.quantity).toBe(14);

    const movements = await testDb.query.stockMovements.findMany({
      where: and(
        eq(stockMovements.tenantId, admin.tenantId),
        eq(stockMovements.productId, createdProduct.id)
      ),
    });

    expect(movements).toHaveLength(3);
    },
    20000
  );

  it("blocks cross-tenant movement creation", async () => {
    const tenantA = await createTestTenant();
    const tenantB = await createTestTenant();

    const contextA = await createTenantContext(tenantA);
    const contextB = await createTenantContext(tenantB);

    const product = await contextA.caller.products.create({
      name: "Protected Product",
      category: "Inventory",
      unit: "pcs",
      price: 25,
      quantity: 20,
    });

    await expect(
      contextB.caller.stockMovements.create({
        productId: product.id,
        type: "exit",
        quantity: 2,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("deduplicates repeated requests with idempotency key", async () => {
    const admin = await createTestTenant();
    const adminCtx = await createTenantContext(admin);

    const product = await adminCtx.caller.products.create({
      name: "Sugar",
      category: "Raw Materials",
      unit: "kg",
      price: 8,
      quantity: 20,
    });

    const idempotencyKey = crypto.randomUUID();

    const first = await adminCtx.caller.stockMovements.create({
      productId: product.id,
      type: "entry",
      quantity: 4,
      idempotencyKey,
    });

    const second = await adminCtx.caller.stockMovements.create({
      productId: product.id,
      type: "entry",
      quantity: 4,
      idempotencyKey,
    });

    expect(second.id).toBe(first.id);

    const productAfter = await testDb.query.products.findFirst({
      where: and(eq(products.id, product.id), eq(products.tenantId, admin.tenantId)),
    });
    expect(productAfter?.quantity).toBe(24);

    const movementsWithKey = await testDb.query.stockMovements.findMany({
      where: and(
        eq(stockMovements.tenantId, admin.tenantId),
        eq(stockMovements.idempotencyKey, idempotencyKey)
      ),
    });

    expect(movementsWithKey).toHaveLength(1);
  });
});
