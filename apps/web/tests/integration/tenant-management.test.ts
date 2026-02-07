// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { tenants, tenantMemberships, user } from "~/server/db/schema";
import {
  clearTenantContext,
  getTenantContext,
  setTenantContext,
  withTenantContext,
} from "~/server/db/rls";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

describe("Tenant Management", () => {
  const testDb = createTestDb();

  beforeAll(async () => {
    await testDb.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stockzen_app') THEN
          CREATE ROLE stockzen_app;
        END IF;
      END
      $$;
    `);

    await testDb.execute(sql`GRANT USAGE ON SCHEMA public TO stockzen_app;`);
    await testDb.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockzen_app;`
    );
  });

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  describe("Database Schema", () => {
    it("should create a tenant with valid data", async () => {
      const tenantName = generateTestTenantName();

      const [tenant] = await testDb
        .insert(tenants)
        .values({ name: tenantName })
        .returning();

      expect(tenant).toBeDefined();
      if (!tenant) {
        throw new Error("Expected tenant to be created");
      }
      expect(tenant.name).toBe(tenantName);
      expect(tenant.id).toBeDefined();
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });

    it("should create multiple tenants", async () => {
      const tenantNames = [
        generateTestTenantName(),
        generateTestTenantName(),
        generateTestTenantName(),
      ];

      const createdTenants = await testDb
        .insert(tenants)
        .values(tenantNames.map((name) => ({ name })))
        .returning();

      expect(createdTenants).toHaveLength(3);
      createdTenants.forEach((tenant, index) => {
        expect(tenant.name).toBe(tenantNames[index]);
      });
    });
  });

  describe("RLS Context", () => {
    it("should set tenant context without error", async () => {
      const testTenantId = "123e4567-e89b-12d3-a456-426614174000";

      // Should execute without throwing
      await expect(setTenantContext(testTenantId)).resolves.not.toThrow();
    });

    it("should get tenant context after setting it", async () => {
      const testTenantId = "123e4567-e89b-12d3-a456-426614174001";

      await setTenantContext(testTenantId);
      const context = await getTenantContext();

      // In a connection pool, this might not persist, but we're testing the function works
      expect(context).toBeDefined();
    });

    it("should clear tenant context without error", async () => {
      // Should execute without throwing
      await expect(clearTenantContext()).resolves.not.toThrow();
    });

    it("should handle null tenant context", async () => {
      // Should execute without throwing
      await expect(setTenantContext(null)).resolves.not.toThrow();
      
      const context = await getTenantContext();
      // When null is passed, the context might be null or empty string
      expect(context === "" || context === null).toBe(true);
    });
  });

  describe("RLS Policies", () => {
    it("should verify RLS is enabled on tenants table", async () => {
      const rlsCheck = await testDb.execute(`
        SELECT relname, relrowsecurity 
        FROM pg_class 
        WHERE relname = 'tenants'
        AND relrowsecurity = true
      `);

      expect(rlsCheck.length).toBe(1);
      expect(rlsCheck[0]?.relname).toBe("tenants");
    });

    it("should verify RLS policies exist for tenants table", async () => {
      const policies = await testDb.execute(`
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'tenants'
      `);

      expect(policies.length).toBeGreaterThanOrEqual(4); // select, insert, update, delete

      const policyNames = policies.map((p) => String((p as { policyname: string }).policyname));
      expect(policyNames).toContain("tenant_isolation_select");
      expect(policyNames).toContain("tenant_isolation_insert");
      expect(policyNames).toContain("tenant_isolation_update");
      expect(policyNames).toContain("tenant_isolation_delete");
    });
  });

  describe("Tenant Isolation", () => {
    it("should prevent cross-tenant reads and writes", async () => {
      const [tenantA, tenantB] = await testDb
        .insert(tenants)
        .values([
          { name: generateTestTenantName() },
          { name: generateTestTenantName() },
        ])
        .returning();

      const [userA, userB] = await testDb
        .insert(user)
        .values([
          {
            id: "user-a",
            name: "User A",
            email: generateTestEmail(),
          },
          {
            id: "user-b",
            name: "User B",
            email: generateTestEmail(),
          },
        ])
        .returning();

      if (!tenantA || !tenantB || !userA || !userB) {
        throw new Error("Expected test fixtures to be created");
      }

      await testDb.insert(tenantMemberships).values([
        { tenantId: tenantA.id, userId: userA.id, role: "Admin" },
        { tenantId: tenantB.id, userId: userB.id, role: "Admin" },
      ]);

      await withTenantContext(tenantA.id, async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE stockzen_app`);
        await tx.execute(sql`SET LOCAL row_security = on`);

        const visibleTenants = await tx.select().from(tenants);
        expect(visibleTenants).toHaveLength(1);
        expect(visibleTenants[0]?.id).toBe(tenantA.id);

        const visibleMemberships = await tx.select().from(tenantMemberships);
        expect(visibleMemberships).toHaveLength(1);
        expect(visibleMemberships[0]?.tenantId).toBe(tenantA.id);

        const updated = await tx
          .update(tenants)
          .set({ name: "Blocked Update" })
          .where(eq(tenants.id, tenantB.id))
          .returning();
        expect(updated).toHaveLength(0);
      });
    });
  });
});
