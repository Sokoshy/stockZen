// @vitest-environment node

import { and, eq, like } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { session, verification } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

const GENERIC_RESET_REQUEST_MESSAGE =
  "If this email exists in our system, check your email for the reset link";
const GENERIC_INVALID_TOKEN_MESSAGE =
  "This reset link is invalid or has expired. Please request a new reset link.";

function getResetToken(identifier: string): string {
  return identifier.replace("reset-password:", "");
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

function buildCookieHeader(setCookieHeader: string): string {
  return extractSessionCookie(setCookieHeader);
}

describe("Auth password reset", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  it("returns the same generic response for existing and non-existing emails", async () => {
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.20.1" }),
    });
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

    const existingEmailCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.20.2" }),
    });
    const existingEmailCaller = createCaller(existingEmailCtx);
    const existingEmailResult = await existingEmailCaller.auth.requestPasswordReset({
      email,
    });

    const unknownEmailCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.20.3" }),
    });
    const unknownEmailCaller = createCaller(unknownEmailCtx);
    const unknownEmailResult = await unknownEmailCaller.auth.requestPasswordReset({
      email: generateTestEmail(),
    });

    expect(existingEmailResult).toEqual({
      success: true,
      message: GENERIC_RESET_REQUEST_MESSAGE,
    });
    expect(unknownEmailResult).toEqual({
      success: true,
      message: GENERIC_RESET_REQUEST_MESSAGE,
    });

    const resetVerification = await testDb.query.verification.findFirst({
      where: and(
        eq(verification.value, signUpResult.user.id),
        like(verification.identifier, "reset-password:%")
      ),
    });

    expect(resetVerification).toBeDefined();
  });

  it("resets password for a valid token and invalidates the used token", async () => {
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.21.1" }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const oldPassword = "Password123";
    const newPassword = "NewPassword123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password: oldPassword,
      confirmPassword: oldPassword,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    const requestCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.21.2" }),
    });
    const requestCaller = createCaller(requestCtx);

    await requestCaller.auth.requestPasswordReset({ email });

    const resetVerification = await testDb.query.verification.findFirst({
      where: and(
        eq(verification.value, signUpResult.user.id),
        like(verification.identifier, "reset-password:%")
      ),
    });

    if (!resetVerification?.identifier) {
      throw new Error("Expected a reset token to be created");
    }

    const token = getResetToken(resetVerification.identifier);

    const resetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.21.3" }),
    });
    const resetCaller = createCaller(resetCtx);

    const resetResult = await resetCaller.auth.resetPassword({
      token,
      newPassword,
    });

    expect(resetResult.success).toBe(true);

    const consumedVerification = await testDb.query.verification.findFirst({
      where: eq(verification.identifier, resetVerification.identifier),
    });
    expect(consumedVerification).toBeUndefined();

    const oldPasswordLoginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.21.4" }),
    });
    const oldPasswordLoginCaller = createCaller(oldPasswordLoginCtx);

    await expect(
      oldPasswordLoginCaller.auth.login({
        email,
        password: oldPassword,
        rememberMe: false,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const newPasswordLoginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.21.5" }),
    });
    const newPasswordLoginCaller = createCaller(newPasswordLoginCtx);

    const newPasswordLoginResult = await newPasswordLoginCaller.auth.login({
      email,
      password: newPassword,
      rememberMe: false,
    });
    expect(newPasswordLoginResult.success).toBe(true);
  });

  it("maps invalid token failures to a non-sensitive error message", async () => {
    const resetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.1" }),
    });
    const resetCaller = createCaller(resetCtx);

    await expect(
      resetCaller.auth.resetPassword({
        token: "invalid-token",
        newPassword: "Password123",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: GENERIC_INVALID_TOKEN_MESSAGE,
    });
  });

  it("rejects replay of an already-used token with non-sensitive error", async () => {
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.2" }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const oldPassword = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password: oldPassword,
      confirmPassword: oldPassword,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    const requestCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.3" }),
    });
    const requestCaller = createCaller(requestCtx);
    await requestCaller.auth.requestPasswordReset({ email });

    const resetVerification = await testDb.query.verification.findFirst({
      where: and(
        eq(verification.value, signUpResult.user.id),
        like(verification.identifier, "reset-password:%")
      ),
    });

    if (!resetVerification?.identifier) {
      throw new Error("Expected a reset token to be created");
    }

    const token = getResetToken(resetVerification.identifier);

    const firstResetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.4" }),
    });
    const firstResetCaller = createCaller(firstResetCtx);
    await firstResetCaller.auth.resetPassword({
      token,
      newPassword: "NewPassword123",
    });

    const replayResetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.5" }),
    });
    const replayResetCaller = createCaller(replayResetCtx);

    await expect(
      replayResetCaller.auth.resetPassword({
        token,
        newPassword: "AnotherPassword123",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: GENERIC_INVALID_TOKEN_MESSAGE,
    });
  });

  it("rejects expired reset token with non-sensitive error", async () => {
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.6" }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const oldPassword = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password: oldPassword,
      confirmPassword: oldPassword,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    const requestCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.7" }),
    });
    const requestCaller = createCaller(requestCtx);
    await requestCaller.auth.requestPasswordReset({ email });

    const resetVerification = await testDb.query.verification.findFirst({
      where: and(
        eq(verification.value, signUpResult.user.id),
        like(verification.identifier, "reset-password:%")
      ),
    });

    if (!resetVerification?.identifier) {
      throw new Error("Expected a reset token to be created");
    }

    await testDb
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(verification.identifier, resetVerification.identifier));

    const token = getResetToken(resetVerification.identifier);

    const resetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.8" }),
    });
    const resetCaller = createCaller(resetCtx);

    await expect(
      resetCaller.auth.resetPassword({
        token,
        newPassword: "NewPassword123",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: GENERIC_INVALID_TOKEN_MESSAGE,
    });
  });

  it("invalidates existing sessions after successful password reset", async () => {
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.22.9" }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const email = generateTestEmail();
    const oldPassword = "Password123";

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password: oldPassword,
      confirmPassword: oldPassword,
      tenantName: generateTestTenantName(),
    });

    if (!signUpResult.user?.id) {
      throw new Error("Expected sign-up to return user ID");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const loginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.23.0" }),
    });
    const loginCaller = createCaller(loginCtx);

    await loginCaller.auth.login({
      email,
      password: oldPassword,
      rememberMe: false,
    });

    const loginSetCookie = loginCtx.responseHeaders.get("set-cookie");
    if (!loginSetCookie) {
      throw new Error("Expected login to set auth cookie");
    }

    const cookieHeader = buildCookieHeader(loginSetCookie);

    const protectedBeforeCtx = await createTRPCContext({
      headers: new Headers({
        cookie: cookieHeader,
        "x-forwarded-for": "127.0.23.0",
        host: "localhost:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      }),
    });
    const protectedBeforeCaller = createCaller(protectedBeforeCtx);
    const membershipsBeforeReset = await protectedBeforeCaller.auth.getTenantMemberships();
    expect(membershipsBeforeReset.length).toBeGreaterThan(0);

    const requestCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.23.2" }),
    });
    const requestCaller = createCaller(requestCtx);
    await requestCaller.auth.requestPasswordReset({ email });

    const resetVerification = await testDb.query.verification.findFirst({
      where: and(
        eq(verification.value, signUpResult.user.id),
        like(verification.identifier, "reset-password:%")
      ),
    });

    if (!resetVerification?.identifier) {
      throw new Error("Expected a reset token to be created");
    }

    const token = getResetToken(resetVerification.identifier);

    const resetCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.23.3" }),
    });
    const resetCaller = createCaller(resetCtx);

    await resetCaller.auth.resetPassword({
      token,
      newPassword: "NewPassword123",
    });

    const remainingSession = await testDb.query.session.findFirst({
      where: eq(session.userId, signUpResult.user.id),
    });
    expect(remainingSession).toBeUndefined();

    const protectedAfterCtx = await createTRPCContext({
      headers: new Headers({
        cookie: cookieHeader,
        "x-forwarded-for": "127.0.23.0",
        host: "localhost:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      }),
    });
    const protectedAfterCaller = createCaller(protectedAfterCtx);

    await expect(protectedAfterCaller.auth.getTenantMemberships()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("applies dedicated rate limiting for password reset request flow", async () => {
    const email = generateTestEmail();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const attemptCtx = await createTRPCContext({
        headers: new Headers({ "x-forwarded-for": "127.0.24.1" }),
      });
      const attemptCaller = createCaller(attemptCtx);

      const result = await attemptCaller.auth.requestPasswordReset({ email });
      expect(result.success).toBe(true);
    }

    const blockedCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.24.1" }),
    });
    const blockedCaller = createCaller(blockedCtx);

    await expect(
      blockedCaller.auth.requestPasswordReset({ email })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("applies dedicated rate limiting for password reset submit flow", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const attemptCtx = await createTRPCContext({
        headers: new Headers({ "x-forwarded-for": "127.0.25.1" }),
      });
      const attemptCaller = createCaller(attemptCtx);

      await expect(
        attemptCaller.auth.resetPassword({
          token: "invalid-token",
          newPassword: "Password123",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }

    const blockedCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": "127.0.25.1" }),
    });
    const blockedCaller = createCaller(blockedCtx);

    await expect(
      blockedCaller.auth.resetPassword({
        token: "invalid-token",
        newPassword: "Password123",
      })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
