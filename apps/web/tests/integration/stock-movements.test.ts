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

  describe("listByProduct pagination", () => {
    it("returns movements sorted newest-first", async () => {
      const admin = await createTestTenant();
      const adminCtx = await createTenantContext(admin);

      const product = await adminCtx.caller.products.create({
        name: "Test Product",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      await adminCtx.caller.stockMovements.create({
        productId: product.id,
        type: "entry",
        quantity: 10,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await adminCtx.caller.stockMovements.create({
        productId: product.id,
        type: "exit",
        quantity: 5,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await adminCtx.caller.stockMovements.create({
        productId: product.id,
        type: "entry",
        quantity: 20,
      });

      const result = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 10,
      });

      expect(result.movements).toHaveLength(3);
      expect(result.movements[0]?.type).toBe("entry");
      expect(result.movements[0]?.quantity).toBe(20);
      expect(result.movements[1]?.type).toBe("exit");
      expect(result.movements[1]?.quantity).toBe(5);
      expect(result.movements[2]?.type).toBe("entry");
      expect(result.movements[2]?.quantity).toBe(10);

      for (let i = 0; i < result.movements.length - 1; i++) {
        const current = result.movements[i];
        const next = result.movements[i + 1];
        if (current && next) {
          expect(new Date(current.createdAt).getTime()).toBeGreaterThanOrEqual(
            new Date(next.createdAt).getTime()
          );
        }
      }
    });

    it("supports cursor-based pagination with composite cursor", async () => {
      const admin = await createTestTenant();
      const adminCtx = await createTenantContext(admin);

      const product = await adminCtx.caller.products.create({
        name: "Pagination Product",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      for (let i = 0; i < 5; i++) {
        await adminCtx.caller.stockMovements.create({
          productId: product.id,
          type: "entry",
          quantity: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const firstPage = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 2,
      });

      expect(firstPage.movements).toHaveLength(2);
      expect(firstPage.nextCursor).toBeDefined();

      const secondPage = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 2,
        cursor: firstPage.nextCursor,
      });

      expect(secondPage.movements).toHaveLength(2);
      expect(secondPage.nextCursor).toBeDefined();

      const thirdPage = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 2,
        cursor: secondPage.nextCursor,
      });

      expect(thirdPage.movements).toHaveLength(1);
      expect(thirdPage.nextCursor).toBeUndefined();
    });

    it("does not skip or duplicate rows across pages", async () => {
      const admin = await createTestTenant();
      const adminCtx = await createTenantContext(admin);

      const product = await adminCtx.caller.products.create({
        name: "No Duplicate Product",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      const createdIds: string[] = [];
      for (let i = 0; i < 7; i++) {
        const movement = await adminCtx.caller.stockMovements.create({
          productId: product.id,
          type: "entry",
          quantity: 1,
        });
        createdIds.push(movement.id);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const allIds: string[] = [];
      let cursor: string | undefined = undefined;

      while (true) {
        const page = await adminCtx.caller.stockMovements.listByProduct({
          productId: product.id,
          limit: 3,
          cursor,
        });

        for (const m of page.movements) {
          allIds.push(m.id);
        }

        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(allIds).toHaveLength(7);
      expect(new Set(allIds).size).toBe(7);

      const allCreatedIds = new Set(createdIds);
      for (const id of allIds) {
        expect(allCreatedIds.has(id)).toBe(true);
      }
    });

    it("uses deterministic ordering with id tie-breaker", async () => {
      const admin = await createTestTenant();
      const adminCtx = await createTenantContext(admin);

      const product = await adminCtx.caller.products.create({
        name: "Tie Breaker Product",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      const movements = [];
      for (let i = 0; i < 5; i++) {
        const movement = await adminCtx.caller.stockMovements.create({
          productId: product.id,
          type: i % 2 === 0 ? "entry" : "exit",
          quantity: 1,
        });
        movements.push(movement);
      }

      const result = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 10,
      });

      expect(result.movements).toHaveLength(5);

      for (let i = 0; i < result.movements.length - 1; i++) {
        const current = result.movements[i];
        const next = result.movements[i + 1];
        if (current && next) {
          const currentTime = new Date(current.createdAt).getTime();
          const nextTime = new Date(next.createdAt).getTime();
          expect(currentTime).toBeGreaterThanOrEqual(nextTime);
        }
      }
    });

    it("returns only tenant-owned movements", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();
      const ctxA = await createTenantContext(tenantA);
      const ctxB = await createTenantContext(tenantB);

      const productA = await ctxA.caller.products.create({
        name: "Product A",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      const productB = await ctxB.caller.products.create({
        name: "Product B",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      await ctxA.caller.stockMovements.create({
        productId: productA.id,
        type: "entry",
        quantity: 10,
      });

      await ctxB.caller.stockMovements.create({
        productId: productB.id,
        type: "entry",
        quantity: 20,
      });

      const resultA = await ctxA.caller.stockMovements.listByProduct({
        productId: productA.id,
        limit: 10,
      });

      const resultB = await ctxB.caller.stockMovements.listByProduct({
        productId: productB.id,
        limit: 10,
      });

      expect(resultA.movements).toHaveLength(1);
      expect(resultA.movements[0]?.quantity).toBe(10);

      expect(resultB.movements).toHaveLength(1);
      expect(resultB.movements[0]?.quantity).toBe(20);
    });

    it("allows Admin, Manager, and Operator to list movements", async () => {
      const admin = await createTestTenant();
      const manager = await addUserToTenantWithRole(admin.tenantId, "Manager");
      const operator = await addUserToTenantWithRole(admin.tenantId, "Operator");

      const adminCtx = await createTenantContext(admin);
      const managerCtx = await createTenantContext(manager);
      const operatorCtx = await createTenantContext(operator);

      const product = await adminCtx.caller.products.create({
        name: "RBAC Product",
        category: "Test",
        unit: "pcs",
        price: 10,
        quantity: 100,
      });

      await adminCtx.caller.stockMovements.create({
        productId: product.id,
        type: "entry",
        quantity: 50,
      });

      const adminResult = await adminCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 10,
      });
      expect(adminResult.movements).toHaveLength(1);

      const managerResult = await managerCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 10,
      });
      expect(managerResult.movements).toHaveLength(1);

      const operatorResult = await operatorCtx.caller.stockMovements.listByProduct({
        productId: product.id,
        limit: 10,
      });
      expect(operatorResult.movements).toHaveLength(1);
    }, 20000);
  });
});
