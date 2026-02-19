// @vitest-environment node

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { tenants } from "~/server/db/schema";
import {
  cleanTestDatabase,
  createTenantWithAdmin,
  createUserWithMembership,
  getTestDb,
} from "../../../../../tests/helpers/tenant-test-factories";

async function createProtectedCaller(sessionToken: string, clientIp: string) {
  const headers = new Headers({
    cookie: sessionToken,
    "x-forwarded-for": clientIp,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const ctx = await createTRPCContext({ headers });
  return createCaller(ctx);
}

describe("tenantThresholds router", () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it("allows Admin to read and update tenant defaults", async () => {
    const adminTenant = await createTenantWithAdmin("threshold-admin");
    const caller = await createProtectedCaller(adminTenant.sessionToken, "127.0.60.1");

    const current = await caller.tenantThresholds.getTenantDefaultThresholds();
    expect(current).toEqual({
      criticalThreshold: 50,
      attentionThreshold: 100,
    });

    const updated = await caller.tenantThresholds.updateTenantDefaultThresholds({
      criticalThreshold: 40,
      attentionThreshold: 80,
    });

    expect(updated).toEqual({
      criticalThreshold: 40,
      attentionThreshold: 80,
    });

    const testDb = await getTestDb();
    const persisted = await testDb.query.tenants.findFirst({
      columns: {
        defaultCriticalThreshold: true,
        defaultAttentionThreshold: true,
      },
      where: eq(tenants.id, adminTenant.tenant.id),
    });

    expect(persisted?.defaultCriticalThreshold).toBe(40);
    expect(persisted?.defaultAttentionThreshold).toBe(80);
  });

  it("allows Manager to read but forbids updates", async () => {
    const adminTenant = await createTenantWithAdmin("threshold-manager-admin");
    const manager = await createUserWithMembership({
      tenantId: adminTenant.tenant.id,
      role: "Manager",
      emailPrefix: "threshold-manager",
    });

    const managerCaller = await createProtectedCaller(manager.sessionToken, "127.0.60.2");

    const current = await managerCaller.tenantThresholds.getTenantDefaultThresholds();
    expect(current).toEqual({
      criticalThreshold: 50,
      attentionThreshold: 100,
    });

    await expect(
      managerCaller.tenantThresholds.updateTenantDefaultThresholds({
        criticalThreshold: 60,
        attentionThreshold: 120,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("forbids Operator updates", async () => {
    const adminTenant = await createTenantWithAdmin("threshold-operator-admin");
    const operator = await createUserWithMembership({
      tenantId: adminTenant.tenant.id,
      role: "Operator",
      emailPrefix: "threshold-operator",
    });

    const operatorCaller = await createProtectedCaller(operator.sessionToken, "127.0.60.3");

    await expect(
      operatorCaller.tenantThresholds.updateTenantDefaultThresholds({
        criticalThreshold: 30,
        attentionThreshold: 70,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects invalid threshold payloads and keeps persisted values unchanged", async () => {
    const adminTenant = await createTenantWithAdmin("threshold-validation");
    const caller = await createProtectedCaller(adminTenant.sessionToken, "127.0.60.4");

    await expect(
      caller.tenantThresholds.updateTenantDefaultThresholds({
        criticalThreshold: 120,
        attentionThreshold: 100,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    const current = await caller.tenantThresholds.getTenantDefaultThresholds();
    expect(current).toEqual({
      criticalThreshold: 50,
      attentionThreshold: 100,
    });
  });

  it("keeps tenant defaults isolated across tenants", async () => {
    const tenantA = await createTenantWithAdmin("threshold-isolation-a");
    const tenantB = await createTenantWithAdmin("threshold-isolation-b");

    const callerA = await createProtectedCaller(tenantA.sessionToken, "127.0.60.5");
    const callerB = await createProtectedCaller(tenantB.sessionToken, "127.0.60.6");

    await callerA.tenantThresholds.updateTenantDefaultThresholds({
      criticalThreshold: 20,
      attentionThreshold: 60,
    });

    const thresholdsA = await callerA.tenantThresholds.getTenantDefaultThresholds();
    const thresholdsB = await callerB.tenantThresholds.getTenantDefaultThresholds();

    expect(thresholdsA).toEqual({
      criticalThreshold: 20,
      attentionThreshold: 60,
    });
    expect(thresholdsB).toEqual({
      criticalThreshold: 50,
      attentionThreshold: 100,
    });
  });
});
