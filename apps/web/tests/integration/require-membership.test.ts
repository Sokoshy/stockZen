// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import {
  session,
  tenantMemberships,
  user,
} from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

const testDb = createTestDb();

let ipSequence = 7000;

function nextIp(): string {
  ipSequence += 1;
  return `127.0.77.${ipSequence}`;
}

function extractSessionCookie(setCookieHeader: string): string {
  const sessionPart = setCookieHeader
    .split(";")
    .find((part) => part.trim().startsWith("__session="));

  if (!sessionPart) {
    throw new Error("Expected __session cookie in Set-Cookie header");
  }

  return sessionPart.trim();
}

async function createProtectedCaller(
  cookie: string,
  clientIp: string,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers({
    cookie,
    "x-forwarded-for": clientIp,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
    ...extraHeaders,
  });

  const ctx = await createTRPCContext({ headers });
  return { ctx, caller: createCaller(ctx) };
}

async function signUpAndGetCookie() {
  const email = generateTestEmail();
  const password = "Password123";
  const tenantName = generateTestTenantName();
  const signUpIp = nextIp();

  const signUpCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": signUpIp }),
  });
  const signUpCaller = createCaller(signUpCtx);

  const signUpResult = await signUpCaller.auth.signUp({
    email,
    password,
    confirmPassword: password,
    tenantName,
  });

  if (!signUpResult.user?.id || !signUpResult.tenant?.id) {
    throw new Error("Expected sign-up to return user and tenant IDs");
  }

  // Delete the sign-up session so login creates a clean one
  await testDb
    .delete(session)
    .where(eq(session.userId, signUpResult.user.id));

  const loginIp = nextIp();
  const loginCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": loginIp }),
  });
  const loginCaller = createCaller(loginCtx);
  await loginCaller.auth.login({
    email,
    password,
    rememberMe: false,
  });

  const setCookie = loginCtx.responseHeaders.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login response to include session cookie");
  }

  return {
    userId: signUpResult.user.id,
    tenantId: signUpResult.tenant.id,
    email,
    cookie: extractSessionCookie(setCookie),
    ip: loginIp,
  };
}

describe("requireMembership middleware", () => {
  beforeEach(async () => {
    await cleanDatabase(testDb);
    ipSequence += 100;
  });

  it("returns FORBIDDEN for non-member user", async () => {
    // Create tenant A with admin
    const tenantA = await signUpAndGetCookie();

    // Create a completely new user (NOT a member of tenant A)
    const nonMember = await signUpAndGetCookie();

    // Try to access tenant A as the non-member via X-Tenant-Id header
    const { caller } = await createProtectedCaller(
      nonMember.cookie,
      nonMember.ip,
      { "x-tenant-id": tenantA.tenantId },
    );

    await expect(caller.products.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns FORBIDDEN for Operator on Admin-only procedure", async () => {
    // Create tenant with admin
    const admin = await signUpAndGetCookie();

    // Create user with Operator role in the same tenant
    const operator = await signUpAndGetCookie();
    await testDb.insert(tenantMemberships).values({
      tenantId: admin.tenantId,
      userId: operator.userId,
      role: "Operator",
    });
    await testDb
      .update(user)
      .set({ defaultTenantId: admin.tenantId })
      .where(eq(user.id, operator.userId));

    // Re-login as operator so session reflects the updated defaultTenantId
    const loginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": nextIp() }),
    });
    const loginCaller = createCaller(loginCtx);
    await loginCaller.auth.login({
      email: operator.email,
      password: "Password123",
      rememberMe: false,
    });
    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    if (!setCookie) throw new Error("Expected login cookie");
    const freshCookie = extractSessionCookie(setCookie);

    // Operator tries to call Admin-only updateTenantMemberRole
    const { caller } = await createProtectedCaller(freshCookie, nextIp());

    await expect(
      caller.auth.updateTenantMemberRole({
        memberUserId: admin.userId,
        role: "Operator",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows Admin on Admin procedure", async () => {
    const admin = await signUpAndGetCookie();
    const { caller } = await createProtectedCaller(admin.cookie, admin.ip);

    const result = await caller.auth.listTenantMembers();

    expect(result.members.length).toBeGreaterThanOrEqual(1);
    expect(result.members[0]!.role).toBe("Admin");
    expect(result.members[0]!.isCurrentUser).toBe(true);
  });

  it("X-Tenant-Id header overrides defaultTenantId", async () => {
    // Create tenant A with admin
    const tenantA = await signUpAndGetCookie();

    // Create tenant B with a different user
    const tenantB = await signUpAndGetCookie();

    // As tenant B's user, try to access tenant A via X-Tenant-Id header
    const { caller } = await createProtectedCaller(
      tenantB.cookie,
      tenantB.ip,
      { "x-tenant-id": tenantA.tenantId },
    );

    // Should be FORBIDDEN — user B is not a member of tenant A
    await expect(caller.products.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("X-Tenant-Id header with valid membership switches context", async () => {
    // Create tenant A with admin
    const tenantA = await signUpAndGetCookie();

    // Create tenant B with a different user
    const tenantB = await signUpAndGetCookie();

    // Add tenant A's admin to tenant B as Operator
    await testDb.insert(tenantMemberships).values({
      tenantId: tenantB.tenantId,
      userId: tenantA.userId,
      role: "Operator",
    });

    // As tenant A's admin, switch to tenant B via X-Tenant-Id header
    const { caller } = await createProtectedCaller(
      tenantA.cookie,
      tenantA.ip,
      { "x-tenant-id": tenantB.tenantId },
    );

    // Should succeed — admin has Operator membership in tenant B
    const result = await caller.products.list();
    expect(result.actorRole).toBe("Operator");
  });

  it("preserves existing RBAC field filtering", async () => {
    // Create tenant with admin
    const admin = await signUpAndGetCookie();

    // Create user with Operator role in the same tenant
    const operator = await signUpAndGetCookie();
    await testDb.insert(tenantMemberships).values({
      tenantId: admin.tenantId,
      userId: operator.userId,
      role: "Operator",
    });
    await testDb
      .update(user)
      .set({ defaultTenantId: admin.tenantId })
      .where(eq(user.id, operator.userId));

    // Re-login as operator
    const loginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": nextIp() }),
    });
    const loginCaller = createCaller(loginCtx);
    await loginCaller.auth.login({
      email: operator.email,
      password: "Password123",
      rememberMe: false,
    });
    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    if (!setCookie) throw new Error("Expected login cookie");
    const freshCookie = extractSessionCookie(setCookie);

    // Admin creates a product with purchasePrice
    const { caller: adminCaller } = await createProtectedCaller(
      admin.cookie,
      admin.ip,
    );
    await adminCaller.products.create({
      name: "Flour",
      price: 42,
      purchasePrice: 21,
      quantity: 10,
      category: "Test Category",
      unit: "kg",
    });

    // Operator lists products — purchasePrice must be omitted
    const { caller: operatorCaller } = await createProtectedCaller(
      freshCookie,
      nextIp(),
    );
    const listResult = await operatorCaller.products.list();

    expect(listResult.actorRole).toBe("Operator");
    expect(listResult.products.length).toBeGreaterThan(0);
    expect(listResult.products[0]).not.toHaveProperty("purchasePrice");
  });
});
