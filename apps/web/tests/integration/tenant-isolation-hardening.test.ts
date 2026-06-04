// @vitest-environment node

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { alerts, products } from "~/server/db/schema";
import {
  attemptCrossTenantRead,
  cleanTestDatabase,
  createTestTenant,
  createTenantContext,
  testDb,
} from "../helpers/tenant-test-factories";

describe("Tenant Isolation Hardening", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe("Non-superuser role enforcement", () => {
    it("stockzen_app role exists and is not a superuser", async () => {
      const result = await testDb.execute(sql`
        SELECT rolname, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = 'stockzen_app'
      `);

      expect(result).toHaveLength(1);
      const role = result[0] as { rolname: string; rolsuper: boolean; rolbypassrls: boolean };
      expect(role.rolname).toBe("stockzen_app");
      expect(role.rolsuper).toBe(false);
      expect(role.rolbypassrls).toBe(false);
    });

    it("stockzen_app role has usage on schema public", async () => {
      const result = await testDb.execute(sql`
        SELECT has_schema_privilege('stockzen_app', 'public', 'USAGE') AS has_usage
      `);

      expect(result[0]).toMatchObject({ has_usage: true });
    });
  });

  describe("FORCE ROW LEVEL SECURITY on all tenant-scoped tables", () => {
    const tenantScopedTables = [
      "tenants",
      "tenant_memberships",
      "tenant_invitations",
      "products",
      "stock_movements",
      "alerts",
      "audit_events",
    ];

    it.each(tenantScopedTables)(
      "table %s has FORCE ROW LEVEL SECURITY enabled",
      async (tableName) => {
        const result = await testDb.execute(sql`
          SELECT relname, relforcerowsecurity
          FROM pg_class
          WHERE relname = ${tableName}
            AND relkind = 'r'
        `);

        expect(result).toHaveLength(1);
        const table = result[0] as { relname: string; relforcerowsecurity: boolean };
        expect(table.relforcerowsecurity).toBe(true);
      }
    );
  });

  describe("Alerts RLS enforcement", () => {
    it("alerts table has all 4 tenant isolation policies", async () => {
      const result = await testDb.execute(sql`
        SELECT polname, polcmd
        FROM pg_policy
        WHERE polrelid = 'alerts'::regclass
        ORDER BY polname
      `);

      const policyNames = result.map((r) => (r as { polname: string }).polname);
      expect(policyNames).toContain("alerts_tenant_isolation_select");
      expect(policyNames).toContain("alerts_tenant_isolation_insert");
      expect(policyNames).toContain("alerts_tenant_isolation_update");
      expect(policyNames).toContain("alerts_tenant_isolation_delete");
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it("prevents cross-tenant alert reads when connected as stockzen_app", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const productA = await contextA.caller.products.create({
        name: "Alert Product A",
        price: 10,
        quantity: 5,
      });

      await testDb.insert(alerts).values({
        tenantId: tenantA.tenantId,
        productId: productA.id as string,
        level: "red",
        status: "active",
        stockAtCreation: 5,
        currentStock: 5,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (testDb as any).$client as {
        unsafe: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
      };

      await client.unsafe("BEGIN");
      await client.unsafe("SET LOCAL ROLE stockzen_app");
      await client.unsafe("SELECT set_config('app.tenant_id', $1, true)", [tenantB.tenantId]);
      await client.unsafe("SELECT set_config('row_security', 'on', true)");

      const countResult = await client.unsafe(
        "SELECT count(*)::int AS cnt FROM alerts WHERE tenant_id = $1",
        [tenantA.tenantId]
      );

      await client.unsafe("COMMIT");

      expect(countResult[0]?.cnt ?? 0).toBe(0);
    });

    it("prevents cross-tenant alert inserts when connected as stockzen_app", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextB = await createTenantContext(tenantB);
      const productB = await contextB.caller.products.create({
        name: "Product B",
        price: 20,
        quantity: 10,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (testDb as any).$client as {
        unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]>;
      };

      await client.unsafe("BEGIN");
      await client.unsafe("SET LOCAL ROLE stockzen_app");
      await client.unsafe("SELECT set_config('app.tenant_id', $1, true)", [tenantB.tenantId]);
      await client.unsafe("SELECT set_config('row_security', 'on', true)");

      let threw = false;
      try {
        await client.unsafe(
          `INSERT INTO alerts (tenant_id, product_id, level, status, stock_at_creation, current_stock)
           VALUES ($1, $2, 'red', 'active', 10, 10)`,
          [tenantA.tenantId, productB.id]
        );
      } catch {
        threw = true;
      }

      await client.unsafe("ROLLBACK").catch(() => {});
      expect(threw).toBe(true);
    });

    it("prevents cross-tenant alert updates when connected as stockzen_app", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const productA = await contextA.caller.products.create({
        name: "Alert Product A",
        price: 10,
        quantity: 5,
      });

      const [insertedAlert] = await testDb.insert(alerts).values({
        tenantId: tenantA.tenantId,
        productId: productA.id as string,
        level: "red",
        status: "active",
        stockAtCreation: 5,
        currentStock: 5,
      }).returning();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (testDb as any).$client as {
        unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]>;
      };

      await client.unsafe("BEGIN");
      await client.unsafe("SET LOCAL ROLE stockzen_app");
      await client.unsafe("SELECT set_config('app.tenant_id', $1, true)", [tenantB.tenantId]);
      await client.unsafe("SELECT set_config('row_security', 'on', true)");

      const updateResult = await client.unsafe(
        "UPDATE alerts SET current_stock = 999 WHERE id = $1",
        [insertedAlert!.id]
      );

      await client.unsafe("COMMIT");

      expect(updateResult.length).toBe(0);
    });

    it("prevents cross-tenant alert deletes when connected as stockzen_app", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const productA = await contextA.caller.products.create({
        name: "Alert Product A",
        price: 10,
        quantity: 5,
      });

      const [insertedAlert] = await testDb.insert(alerts).values({
        tenantId: tenantA.tenantId,
        productId: productA.id as string,
        level: "red",
        status: "active",
        stockAtCreation: 5,
        currentStock: 5,
      }).returning();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (testDb as any).$client as {
        unsafe: (sql: string, params?: unknown[]) => Promise<unknown[]>;
      };

      await client.unsafe("BEGIN");
      await client.unsafe("SET LOCAL ROLE stockzen_app");
      await client.unsafe("SELECT set_config('app.tenant_id', $1, true)", [tenantB.tenantId]);
      await client.unsafe("SELECT set_config('row_security', 'on', true)");

      const deleteResult = await client.unsafe(
        "DELETE FROM alerts WHERE id = $1",
        [insertedAlert!.id]
      );

      await client.unsafe("COMMIT");

      expect(deleteResult.length).toBe(0);
    });

    it("prevents cross-tenant alert reads through application layer (tRPC)", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const productA = await contextA.caller.products.create({
        name: "Alert Product A via tRPC",
        price: 10,
        quantity: 5,
      });

      await testDb.insert(alerts).values({
        tenantId: tenantA.tenantId,
        productId: productA.id as string,
        level: "red",
        status: "active",
        stockAtCreation: 5,
        currentStock: 5,
      });

      const contextB = await createTenantContext(tenantB);
      const readAttempt = await attemptCrossTenantRead(
        contextB.caller,
        "products",
        productA.id as string
      );

      expect(readAttempt.success).toBe(false);
    });
  });

  describe("postRouter removal", () => {
    it("appRouter does not contain a 'post' namespace", async () => {
      const { appRouter } = await import("~/server/api/root");
      const routerShape = appRouter._def.procedures;

      expect(routerShape).not.toHaveProperty("post");
      expect(routerShape).not.toHaveProperty("post.hello");
      expect(routerShape).not.toHaveProperty("post.create");
      expect(routerShape).not.toHaveProperty("post.getLatest");
    });

    it("posts table no longer exists in schema", async () => {
      const schemaModule = await import("~/server/db/schema");
      expect(schemaModule).not.toHaveProperty("posts");
    });
  });
});
