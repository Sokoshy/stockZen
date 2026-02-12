// @vitest-environment node

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { products, session, user } from "~/server/db/schema";
import { addUserToTenantWithRole, cleanTestDatabase, createTestTenant, createTenantContext, testDb } from "../helpers/tenant-test-factories";

describe("Tenant Isolation - Anti-Leak Tests", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe("Cross-Tenant Read Isolation", () => {
    it("prevents Tenant B from reading Tenant A's products via getById", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const product = await contextA.caller.products.create({
        name: "Secret Product A",
        price: 100,
        quantity: 50,
      });

      const contextB = await createTenantContext(tenantB);

      await expect(
        contextB.caller.products.getById({ id: product.id as string })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("prevents Tenant B from reading Tenant A's products in list", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      await contextA.caller.products.create({
        name: "Tenant A Product 1",
        price: 10,
        quantity: 5,
      });
      await contextA.caller.products.create({
        name: "Tenant A Product 2",
        price: 20,
        quantity: 10,
      });

      const contextB = await createTenantContext(tenantB);
      const listResult = await contextB.caller.products.list();

      expect(listResult.products).toHaveLength(0);
    });

    it("prevents Tenant B from reading Tenant A memberships", async () => {
      const adminA = await createTestTenant();
      const adminB = await createTestTenant();
      const memberA = await addUserToTenantWithRole(adminA.tenantId, "Operator");

      const contextB = await createTenantContext(adminB);
      const membersInTenantB = await contextB.caller.auth.listTenantMembers();

      expect(membersInTenantB.members.length).toBeGreaterThan(0);
      expect(membersInTenantB.members.some((member) => member.userId === adminA.userId)).toBe(false);
      expect(membersInTenantB.members.some((member) => member.userId === memberA.userId)).toBe(false);
    });

    it("prevents reading product by UUID guess attack", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const product = await contextA.caller.products.create({
        name: "Real Product",
        price: 50,
        quantity: 25,
      });

      const contextB = await createTenantContext(tenantB);

      const fakeUuid = "00000000-0000-0000-0000-000000000001";
      await expect(
        contextB.caller.products.getById({ id: fakeUuid })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const realUuid = product.id as string;
      await expect(
        contextB.caller.products.getById({ id: realUuid })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Cross-Tenant Write Isolation", () => {
    it("prevents Tenant B from updating Tenant A's products", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const product = await contextA.caller.products.create({
        name: "Original Name",
        price: 100,
        quantity: 10,
      });

      const contextB = await createTenantContext(tenantB);

      await expect(
        contextB.caller.products.update({
          id: product.id as string,
          data: { name: "Hacked Name", price: 1 },
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const verifyA = await contextA.caller.products.getById({ id: product.id as string });
      expect(verifyA.name).toBe("Original Name");
      expect(verifyA.price).toBe(100);
    });

    it("prevents Tenant B from deleting Tenant A's products", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const product = await contextA.caller.products.create({
        name: "Protected Product",
        price: 200,
        quantity: 20,
      });

      const contextB = await createTenantContext(tenantB);

      await expect(
        contextB.caller.products.delete({ id: product.id as string })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const verifyA = await contextA.caller.products.getById({ id: product.id as string });
      expect(verifyA).toBeDefined();
      expect(verifyA.name).toBe("Protected Product");
    });

    it("prevents Tenant B from mutating Tenant A memberships", async () => {
      const adminA = await createTestTenant();
      const adminB = await createTestTenant();
      const managerA = await addUserToTenantWithRole(adminA.tenantId, "Manager");

      const contextB = await createTenantContext(adminB);

      await expect(
        contextB.caller.auth.updateTenantMemberRole({
          memberUserId: managerA.userId,
          role: "Operator",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const contextA = await createTenantContext(adminA);
      const membersInTenantA = await contextA.caller.auth.listTenantMembers();
      const unchangedMember = membersInTenantA.members.find(
        (member) => member.userId === managerA.userId
      );

      expect(unchangedMember?.role).toBe("Manager");
    });

    it("creates products only in caller's tenant, not in other tenant's namespace", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextB = await createTenantContext(tenantB);

      const created = await contextB.caller.products.create({
        name: "Tenant B Product",
        price: 1,
        quantity: 1,
      });

      expect(created.tenantId).toBe(tenantB.tenantId);

      const tenantAProducts = await testDb.query.products.findMany({
        where: eq(products.tenantId, tenantA.tenantId),
      });
      expect(tenantAProducts.length).toBe(0);

      const tenantBProducts = await testDb.query.products.findMany({
        where: eq(products.tenantId, tenantB.tenantId),
      });
      expect(tenantBProducts.length).toBe(1);
      expect(tenantBProducts[0]?.name).toBe("Tenant B Product");
    });
  });

  describe("Bulk Operation Isolation", () => {
    it("ensures list query returns only tenant-owned rows with hundreds of records", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const contextB = await createTenantContext(tenantB);

      const tenantASeed = Array.from({ length: 120 }, (_, index) => ({
        tenantId: tenantA.tenantId,
        name: `Tenant A Product ${index + 1}`,
        price: "10.00",
        quantity: index + 1,
      }));

      const tenantBSeed = Array.from({ length: 140 }, (_, index) => ({
        tenantId: tenantB.tenantId,
        name: `Tenant B Product ${index + 1}`,
        price: "20.00",
        quantity: index + 1,
      }));

      await testDb.insert(products).values([...tenantASeed, ...tenantBSeed]);

      const listA = await contextA.caller.products.list();
      expect(listA.products).toHaveLength(120);
      expect(listA.products.every((product) => product.name.startsWith("Tenant A Product"))).toBe(
        true
      );

      const listB = await contextB.caller.products.list();
      expect(listB.products).toHaveLength(140);
      expect(listB.products.every((product) => product.name.startsWith("Tenant B Product"))).toBe(
        true
      );
    });
  });

  describe("RLS Context Validation", () => {
    it("fails safely when session is missing", async () => {
      const tenantA = await createTestTenant();

      await testDb.delete(session).where(eq(session.userId, tenantA.userId));

      const headers = new Headers({
        cookie: tenantA.cookie,
        "x-forwarded-for": tenantA.ip,
        host: "localhost:3000",
      });

      const { createTRPCContext } = await import("~/server/api/trpc");
      const { createCaller } = await import("~/server/api/root");

      const ctx = await createTRPCContext({ headers });
      const caller = createCaller(ctx);

      await expect(caller.products.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("fails safely when authenticated user has no tenant context", async () => {
      const tenantA = await createTestTenant();

      await testDb
        .update(user)
        .set({ defaultTenantId: null })
        .where(eq(user.id, tenantA.userId));

      const contextA = await createTenantContext(tenantA);

      await expect(contextA.caller.products.list()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("fails safely when tenant context points to a tenant without membership", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      await testDb
        .update(user)
        .set({ defaultTenantId: tenantB.tenantId })
        .where(eq(user.id, tenantA.userId));

      const contextA = await createTenantContext(tenantA);

      await expect(contextA.caller.products.list()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("Multiple Entity Types", () => {
    it("enforces RBAC within same tenant - Operator cannot see purchasePrice", async () => {
      const adminA = await createTestTenant();
      
      const operatorA = await addUserToTenantWithRole(adminA.tenantId, "Operator");

      const contextAdminA = await createTenantContext(adminA);
      const product = await contextAdminA.caller.products.create({
        name: "Admin A Product",
        price: 100,
        quantity: 10,
        purchasePrice: 50,
      });

      const contextOperatorA = await createTenantContext(operatorA);

      const operatorProduct = await contextOperatorA.caller.products.getById({ id: product.id as string });
      expect(operatorProduct).not.toHaveProperty("purchasePrice");
    });

    it("isolates between different tenants - same role cannot access cross-tenant data", async () => {
      const adminA = await createTestTenant();
      const adminB = await createTestTenant();

      const contextA = await createTenantContext(adminA);
      const productA = await contextA.caller.products.create({
        name: "Tenant A Product",
        price: 100,
        quantity: 10,
      });

      const contextB = await createTenantContext(adminB);

      await expect(
        contextB.caller.products.getById({ id: productA.id as string })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Transaction Isolation", () => {
    it("maintains isolation within transaction scope", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const contextB = await createTenantContext(tenantB);

      const productA = await contextA.caller.products.create({
        name: "Transaction Test A",
        price: 75,
        quantity: 7,
      });

      const listA = await contextA.caller.products.list();
      expect(listA.products.some((p) => p.id === productA.id)).toBe(true);

      const listB = await contextB.caller.products.list();
      expect(listB.products.some((p) => p.id === productA.id)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles malformed forwarding headers without leaking cross-tenant data", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const productA = await contextA.caller.products.create({
        name: "Header Isolation Product",
        price: 25,
        quantity: 3,
      });

      const headers = new Headers({
        cookie: tenantB.cookie,
        "x-forwarded-for": "invalid-ip",
        "x-forwarded-host": "not-a-host",
        "x-forwarded-proto": "http",
        host: "localhost:3000",
      });

      const { createTRPCContext } = await import("~/server/api/trpc");
      const { createCaller } = await import("~/server/api/root");

      const ctx = await createTRPCContext({ headers });
      expect(ctx.tenantId).toBe(tenantB.tenantId);

      const caller = createCaller(ctx);
      await expect(caller.products.getById({ id: productA.id as string })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("isolates when both tenants have same product names", async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      const contextA = await createTenantContext(tenantA);
      const contextB = await createTenantContext(tenantB);

      await contextA.caller.products.create({
        name: "Same Name Product",
        price: 10,
        quantity: 5,
      });

      await contextB.caller.products.create({
        name: "Same Name Product",
        price: 20,
        quantity: 10,
      });

      const listA = await contextA.caller.products.list();
      const listB = await contextB.caller.products.list();

      expect(listA.products).toHaveLength(1);
      expect(listB.products).toHaveLength(1);

      expect(listA.products[0]?.price).toBe(10);
      expect(listB.products[0]?.price).toBe(20);
    });
  });
});
