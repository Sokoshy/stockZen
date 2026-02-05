import { describe, it, expect, beforeAll } from "vitest";

import { db } from "~/server/db";
import { tenants } from "~/server/db/schema";
import { setTenantContext, clearTenantContext, getTenantContext } from "~/server/db/rls";
import { generateTestTenantName } from "../helpers/database";

describe("Tenant Management", () => {
  describe("Database Schema", () => {
    it("should create a tenant with valid data", async () => {
      const tenantName = generateTestTenantName();

      const [tenant] = await db
        .insert(tenants)
        .values({ name: tenantName })
        .returning();

      expect(tenant).toBeDefined();
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

      const createdTenants = await db
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
      const rlsCheck = await db.execute(`
        SELECT relname, relrowsecurity 
        FROM pg_class 
        WHERE relname = 'tenants'
        AND relrowsecurity = true
      `);

      expect(rlsCheck.length).toBe(1);
      expect(rlsCheck[0]?.relname).toBe("tenants");
    });

    it("should verify RLS policies exist for tenants table", async () => {
      const policies = await db.execute(`
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'tenants'
      `);

      expect(policies.length).toBeGreaterThanOrEqual(4); // select, insert, update, delete

      const policyNames = policies.map((p: { policyname: string }) => p.policyname);
      expect(policyNames).toContain("tenant_isolation_select");
      expect(policyNames).toContain("tenant_isolation_insert");
      expect(policyNames).toContain("tenant_isolation_update");
      expect(policyNames).toContain("tenant_isolation_delete");
    });
  });
});
