// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { session } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

function extractSessionCookie(setCookieHeader: string): string {
  const sessionPart = setCookieHeader
    .split(";")
    .find((part) => part.trim().startsWith("__session="));

  if (!sessionPart) {
    throw new Error("Expected __session cookie in Set-Cookie header");
  }

  return sessionPart.trim();
}

function buildCookieHeader(setCookieHeader: string): string {
  return extractSessionCookie(setCookieHeader);
}

describe("Auth login/logout", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  it("creates a DB session, sets auth cookie, and allows tenant-scoped access", async () => {
    const signUpHeaders = new Headers({ "x-forwarded-for": "127.0.10.1" });
    const signUpCtx = await createTRPCContext({ headers: signUpHeaders });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const password = "Password123";
    const tenantName = generateTestTenantName();

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName,
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const clientIp = "127.0.10.2";
    const loginHeaders = new Headers({ "x-forwarded-for": clientIp });
    const loginCtx = await createTRPCContext({ headers: loginHeaders });
    const loginCaller = createCaller(loginCtx);

    const loginResult = await loginCaller.auth.login({
      email,
      password,
      rememberMe: false,
    });

    expect(loginResult.success).toBe(true);
    expect(loginResult.user?.email).toBe(email);

    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie ?? "").toContain("__session=");
    expect(setCookie ?? "").not.toContain("Max-Age=");

    const dbSession = await testDb.query.session.findFirst({
      where: eq(session.userId, signUpResult.user.id),
    });
    expect(dbSession).toBeDefined();

    const cookieHeader = buildCookieHeader(setCookie ?? "");
    const protectedHeaders = new Headers({
      cookie: cookieHeader,
      "x-forwarded-for": clientIp,
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    const protectedCtx = await createTRPCContext({ headers: protectedHeaders });
    const protectedCaller = createCaller(protectedCtx);

    const memberships = await protectedCaller.auth.getTenantMemberships();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.tenantId).toBe(signUpResult.tenant?.id);
  });

  it("returns a generic error and does not set a cookie for invalid credentials", async () => {
    const signUpHeaders = new Headers({ "x-forwarded-for": "127.0.11.1" });
    const signUpCtx = await createTRPCContext({ headers: signUpHeaders });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const password = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const loginHeaders = new Headers({ "x-forwarded-for": "127.0.11.2" });
    const loginCtx = await createTRPCContext({ headers: loginHeaders });
    const loginCaller = createCaller(loginCtx);

    await expect(
      loginCaller.auth.login({
        email,
        password: "WrongPassword123",
        rememberMe: false,
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    expect(loginCtx.responseHeaders.get("set-cookie")).toBeNull();
  });

  it("extends session expiry and sets persistent cookie when rememberMe is true", async () => {
    const signUpHeaders = new Headers({ "x-forwarded-for": "127.0.12.1" });
    const signUpCtx = await createTRPCContext({ headers: signUpHeaders });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const password = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const loginHeaders = new Headers({ "x-forwarded-for": "127.0.12.2" });
    const loginCtx = await createTRPCContext({ headers: loginHeaders });
    const loginCaller = createCaller(loginCtx);

    const loginResult = await loginCaller.auth.login({
      email,
      password,
      rememberMe: true,
    });

    if (!loginResult.user?.id) {
      throw new Error("Expected login to return user ID");
    }

    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie ?? "").toContain("Max-Age=");
    expect(setCookie ?? "").toContain("Expires=");

    const dbSession = await testDb.query.session.findFirst({
      where: eq(session.userId, loginResult.user.id),
    });

    expect(dbSession).toBeDefined();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const minExpectedExpiry = Date.now() + thirtyDaysInMs - 2 * 60 * 1000;
    expect((dbSession?.expiresAt?.getTime() ?? 0) >= minExpectedExpiry).toBe(true);
  });

  it("invalidates DB session, clears cookie on logout, and blocks subsequent authenticated requests", async () => {
    const signUpHeaders = new Headers({ "x-forwarded-for": "127.0.13.1" });
    const signUpCtx = await createTRPCContext({ headers: signUpHeaders });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const password = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const clientIp = "127.0.13.2";
    const loginHeaders = new Headers({ "x-forwarded-for": clientIp });
    const loginCtx = await createTRPCContext({ headers: loginHeaders });
    const loginCaller = createCaller(loginCtx);

    const loginResult = await loginCaller.auth.login({
      email,
      password,
      rememberMe: false,
    });

    if (!loginResult.user?.id) {
      throw new Error("Expected login to return user ID");
    }

    const loginSetCookie = loginCtx.responseHeaders.get("set-cookie");
    const cookieHeader = buildCookieHeader(loginSetCookie ?? "");

    const activeSession = await testDb.query.session.findFirst({
      where: eq(session.userId, loginResult.user.id),
    });
    expect(activeSession).toBeDefined();

    const logoutHeaders = new Headers({
      cookie: cookieHeader,
      "x-forwarded-for": clientIp,
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    const logoutCtx = await createTRPCContext({ headers: logoutHeaders });
    const logoutCaller = createCaller(logoutCtx);

    const logoutResult = await logoutCaller.auth.logout();
    expect(logoutResult.success).toBe(true);

    const logoutSetCookie = logoutCtx.responseHeaders.get("set-cookie");
    expect(logoutSetCookie).toContain("__session=");
    expect(logoutSetCookie).toContain("Max-Age=0");

    const deletedSession = await testDb.query.session.findFirst({
      where: eq(session.userId, loginResult.user.id),
    });
    expect(deletedSession).toBeUndefined();

    const blockedHeaders = new Headers({
      cookie: cookieHeader,
      "x-forwarded-for": clientIp,
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    });
    const blockedCtx = await createTRPCContext({ headers: blockedHeaders });
    const blockedCaller = createCaller(blockedCtx);

    await expect(blockedCaller.auth.getTenantMemberships()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rate limits repeated failed login attempts", async () => {
    const signUpHeaders = new Headers({ "x-forwarded-for": "127.0.14.1" });
    const signUpCtx = await createTRPCContext({ headers: signUpHeaders });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const password = "Password123";

    await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName: generateTestTenantName(),
    });

    for (let i = 0; i < 5; i++) {
      const headers = new Headers({ "x-forwarded-for": "127.0.14.2" });
      const ctx = await createTRPCContext({ headers });
      const caller = createCaller(ctx);

      await expect(
        caller.auth.login({
          email,
          password: "WrongPassword123",
          rememberMe: false,
        })
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    const blockedHeaders = new Headers({ "x-forwarded-for": "127.0.14.2" });
    const blockedCtx = await createTRPCContext({ headers: blockedHeaders });
    const blockedCaller = createCaller(blockedCtx);

    await expect(
      blockedCaller.auth.login({
        email,
        password: "WrongPassword123",
        rememberMe: false,
      })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
