// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { tenantMemberships, user } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

describe("Auth sign-up", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  it("creates tenant, admin membership, and session cookie", async () => {
    const headers = new Headers({ "x-forwarded-for": "127.0.0.1" });
    const ctx = await createTRPCContext({ headers });
    const caller = createCaller(ctx);

    const email = generateTestEmail();
    const tenantName = generateTestTenantName();

    const result = await caller.auth.signUp({
      email,
      password: "Password123",
      confirmPassword: "Password123",
      tenantName,
    });

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe(email);
    expect(result.tenant?.name).toBe(tenantName);

    const createdUser = await testDb.query.user.findFirst({
      where: eq(user.email, email),
    });
    expect(createdUser?.defaultTenantId).toBe(result.tenant?.id);

    const membership = await testDb.query.tenantMemberships.findFirst({
      where: eq(tenantMemberships.userId, createdUser?.id ?? ""),
    });
    expect(membership?.role).toBe("Admin");

    const setCookie = ctx.responseHeaders.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie ?? "").toContain("__session=");
  });

  it("rejects duplicate email sign-ups", async () => {
    const headers = new Headers({ "x-forwarded-for": "127.0.0.2" });
    const ctx = await createTRPCContext({ headers });
    const caller = createCaller(ctx);

    const email = generateTestEmail();
    const tenantName = generateTestTenantName();

    await caller.auth.signUp({
      email,
      password: "Password123",
      confirmPassword: "Password123",
      tenantName,
    });

    await expect(
      caller.auth.signUp({
        email,
        password: "Password123",
        confirmPassword: "Password123",
        tenantName: generateTestTenantName(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
