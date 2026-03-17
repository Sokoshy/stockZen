// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  BILLING_UPGRADE_ROUTE,
  PLAN_LIMITS,
  checkProductLimit,
  checkUserLimit,
  getCurrentSubscription,
  getCurrentUsage,
  getPendingInvitationUsage,
  getPlanLimits,
} from "~/server/services/subscription-service";

function createSelectDb(counts: number[]) {
  let callIndex = 0;

  return {
    select: () => ({
      from: () => ({
        where: async () => [{ count: counts[callIndex++] ?? 0 }],
      }),
    }),
  };
}

describe("subscription-service", () => {
  it("maps the supported plans to the expected limits", () => {
    expect(getPlanLimits("Free")).toEqual(PLAN_LIMITS.Free);
    expect(getPlanLimits("Starter")).toEqual({ maxProducts: 50, maxUsers: 2 });
    expect(getPlanLimits("Pro")).toEqual({ maxProducts: 150, maxUsers: 3 });
  });

  it("defaults the current subscription to Free when no subscription record exists", async () => {
    const subscription = await getCurrentSubscription({
      db: {
        query: {
          tenants: {
            findFirst: async () => undefined,
          },
        },
      } as never,
      tenantId: "tenant-1",
    });

    expect(subscription).toEqual({
      plan: "Free",
      limits: { maxProducts: 20, maxUsers: 1 },
      source: "default",
    });
  });

  it("uses the tenant subscription plan when one is stored", async () => {
    const subscription = await getCurrentSubscription({
      db: {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Pro" }),
          },
        },
      } as never,
      tenantId: "tenant-1",
    });

    expect(subscription).toEqual({
      plan: "Pro",
      limits: { maxProducts: 150, maxUsers: 3 },
      source: "tenant",
    });
  });

  it("counts active products and tenant members for current usage", async () => {
    const db = createSelectDb([2, 2]);

    const usage = await getCurrentUsage({
      db: db as never,
      tenantId: "tenant-1",
    });

    expect(usage).toEqual({
      productCount: 2,
      userCount: 2,
    });
  });

  it("counts only active pending invitations for reserved user seats", async () => {
    const pendingInvitationCount = await getPendingInvitationUsage({
      db: createSelectDb([3]) as never,
      tenantId: "tenant-1",
    });

    expect(pendingInvitationCount).toBe(3);
  });

  describe("checkProductLimit", () => {
    it("allows product creation when under the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Free" }),
          },
        },
        ...createSelectDb([10, 1]),
      } as never;

      const result = await checkProductLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(10);
      expect(result.limit).toBe(20);
      expect(result.plan).toBe("Free");
    });

    it("denies product creation when at the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Free" }),
          },
        },
        ...createSelectDb([20, 1]),
      } as never;

      const result = await checkProductLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(20);
      expect(result.limit).toBe(20);
      expect(result.upgradeRoute).toBe(BILLING_UPGRADE_ROUTE);
    });

    it("denies product creation when over the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Free" }),
          },
        },
        ...createSelectDb([25, 1]),
      } as never;

      const result = await checkProductLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(false);
      expect(result.upgradeRoute).toBe(BILLING_UPGRADE_ROUTE);
    });
  });

  describe("checkUserLimit", () => {
    it("allows user invitation when under the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Starter" }),
          },
        },
        ...createSelectDb([0, 1, 0]),
      } as never;

      const result = await checkUserLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.plan).toBe("Starter");
    });

    it("denies user invitation when memberships and pending invitations exhaust the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Starter" }),
          },
        },
        ...createSelectDb([0, 1, 1]),
      } as never;

      const result = await checkUserLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.upgradeRoute).toBe(BILLING_UPGRADE_ROUTE);
    });

    it("denies user invitation when over the limit", async () => {
      const mockDb = {
        query: {
          tenants: {
            findFirst: async () => ({ subscriptionPlan: "Free" }),
          },
        },
        ...createSelectDb([0, 5, 0]),
      } as never;

      const result = await checkUserLimit({
        db: mockDb,
        tenantId: "tenant-1",
      });

      expect(result.allowed).toBe(false);
      expect(result.upgradeRoute).toBe(BILLING_UPGRADE_ROUTE);
    });
  });
});
