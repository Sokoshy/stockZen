// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  PLAN_LIMITS,
  getCurrentSubscription,
  getCurrentUsage,
  getPlanLimits,
} from "~/server/services/subscription-service";

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
    const selectMock = {
      from: () => ({
        where: async () => [{ count: 2 }],
      }),
    };
    const db = {
      select: () => selectMock,
    } as never;

    const usage = await getCurrentUsage({
      db,
      tenantId: "tenant-1",
    });

    expect(usage).toEqual({
      productCount: 2,
      userCount: 2,
    });
  });
});
