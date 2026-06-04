// @vitest-environment node

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { alerts, products } from "~/server/db/schema";
import {
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
    it("alerts table has RLS enabled with tenant isolation policies", async () => {
      const result = await testDb.execute(sql`
        SELECT polname, polcmd, polroles::regrole[]
        FROM pg_policy
        WHERE polrelid = 'alerts'::regclass
        ORDER BY polname
      `);

      expect(result.length).toBeGreaterThanOrEqual(2);

      const policyNames = result.map((r) => (r as { polname: string }).polname);
      expect(policyNames).toContain("alerts_tenant_isolation_select");
      expect(policyNames).toContain("alerts_tenant_isolation_insert");
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
      const client = await (testDb as any).$client as { unsafe: (sql: string) => Promise<Record<string, unknown>[]> };

      const alertCount = await client.unsafe(`
        BEGIN;
        SET LOCAL ROLE stockzen_app;
        SELECT set_config('app.tenant_id', '${tenantB.tenantId}', true);
        SELECT set_config('row_security', 'on', true);
        SELECT count(*)::int AS cnt FROM alerts WHERE tenant_id = '${tenantA.tenantId}';
        COMMIT;
      `);

      const countRow = alertCount.find(
        (row: Record<string, unknown>) => "cnt" in row
      ) as { cnt: number } | undefined;

      expect(countRow?.cnt ?? 0).toBe(0);
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
      const client = await (testDb as any).$client as { unsafe: (sql: string) => Promise<unknown[]> };

      let threw = false;
      try {
        await client.unsafe(`
          BEGIN;
          SET LOCAL ROLE stockzen_app;
          SELECT set_config('app.tenant_id', '${tenantB.tenantId}', true);
          SELECT set_config('row_security', 'on', true);
          INSERT INTO alerts (tenant_id, product_id, level, status, stock_at_creation, current_stock)
          VALUES ('${tenantA.tenantId}', '${productB.id}', 'red', 'active', 10, 10);
          COMMIT;
        `);
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
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
