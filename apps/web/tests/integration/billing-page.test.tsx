import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "~/server/api/root";
import { products, tenants } from "~/server/db/schema";
import {
  cleanupTestData,
  createTenantWithAdmin,
  createUserWithMembership,
  getTestDb,
} from "../helpers/tenant-test-factories";
import { setupTestTRPCContext } from "../helpers/trpc-test-context";

describe("billing integration", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it("returns the tenant subscription plan and current usage for admins", async () => {
    const { tenant, admin, sessionToken } = await createTenantWithAdmin("billing-admin");
    const db = await getTestDb();

    await db
      .update(tenants)
      .set({ subscriptionPlan: "Starter" })
      .where(eq(tenants.id, tenant.id));

    await db.insert(products).values([
      {
        tenantId: tenant.id,
        name: "Rice",
        price: "10.00",
      },
      {
        tenantId: tenant.id,
        name: "Beans",
        price: "12.00",
      },
    ]);

    const caller = appRouter.createCaller(
      await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
    );

    const overview = await caller.billing.overview();

    expect(overview.actorRole).toBe("Admin");
    expect(overview.canManagePlan).toBe(true);
    expect(overview.subscription).toEqual({
      plan: "Starter",
      limits: { maxProducts: 50, maxUsers: 2 },
      source: "tenant",
    });
    expect(overview.usage).toEqual({
      productCount: 2,
      userCount: 1,
    });
    expect(admin.email).toContain("@");
  });

  it("defaults to Free when the tenant has no stored subscription plan and still allows managers to view it", async () => {
    const { tenant } = await createTenantWithAdmin("billing-manager");
    const manager = await createUserWithMembership({
      tenantId: tenant.id,
      role: "Manager",
      emailPrefix: "billing-manager-member",
    });
    const db = await getTestDb();

    const caller = appRouter.createCaller(
      await setupTestTRPCContext({ db, sessionToken: manager.sessionToken, tenantId: tenant.id })
    );

    const overview = await caller.billing.overview();

    expect(overview.actorRole).toBe("Manager");
    expect(overview.canManagePlan).toBe(false);
    expect(overview.subscription).toEqual({
      plan: "Free",
      limits: { maxProducts: 20, maxUsers: 1 },
      source: "default",
    });
    expect(overview.usage.userCount).toBeGreaterThanOrEqual(2);
  });
});
