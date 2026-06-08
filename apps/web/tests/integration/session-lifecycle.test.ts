// @vitest-environment node

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

import {
  applyRememberMeExtension,
  destroySession,
  invalidateAllUserSessions,
} from "~/server/lib/session-lifecycle";
import { session } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const testDb = createTestDb();

/** Create a user and return their id + a helper to insert sessions. */
async function createTestUser() {
  const email = generateTestEmail();
  const password = "Password123";
  const tenantName = generateTestTenantName();

  const ctx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": "127.0.90.1" }),
  });
  const caller = createCaller(ctx);

  const result = await caller.auth.signUp({
    email,
    password,
    confirmPassword: password,
    tenantName,
  });

  if (!result.user?.id) {
    throw new Error("Expected sign-up to return user ID");
  }

  // Clean any sessions created during sign-up so tests start clean
  await testDb.delete(session).where(eq(session.userId, result.user.id));

  return { userId: result.user.id, email, password };
}

async function insertSession(
  userId: string,
  token: string,
  expiresAt: Date,
) {
  const now = new Date();
  await testDb.insert(session).values({
    id: `sess-${token}`,
    userId,
    token,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

describe("session-lifecycle", () => {
  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  // ─── applyRememberMeExtension ────────────────────────────────────

  describe("applyRememberMeExtension", () => {
    it("should extend only the current session when rememberMe is true", async () => {
      const { userId } = await createTestUser();
      const now = new Date();
      const shortExpiry = new Date(now.getTime() + 30 * 60 * 1000); // 30 min

      const tokenA = "token-A";
      const tokenB = "token-B";
      await insertSession(userId, tokenA, shortExpiry);
      await insertSession(userId, tokenB, shortExpiry);

      const result = await applyRememberMeExtension(testDb, tokenA, true);

      // Token A should now expire in ~30 days
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const minExpected = Date.now() + thirtyDaysMs - 2 * 60 * 1000;
      const maxExpected = Date.now() + thirtyDaysMs + 2 * 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(minExpected);
      expect(result.getTime()).toBeLessThanOrEqual(maxExpected);

      // DB: token A updated
      const sessionA = await testDb.query.session.findFirst({
        where: eq(session.token, tokenA),
      });
      expect(sessionA).toBeDefined();
      expect(sessionA!.expiresAt.getTime()).toBeGreaterThanOrEqual(minExpected);

      // DB: token B unchanged (still short expiry)
      const sessionB = await testDb.query.session.findFirst({
        where: eq(session.token, tokenB),
      });
      expect(sessionB).toBeDefined();
      expect(sessionB!.expiresAt.getTime()).toBeLessThan(minExpected);
    });

    it("should not update DB when rememberMe is false", async () => {
      const { userId } = await createTestUser();
      const now = new Date();
      const shortExpiry = new Date(now.getTime() + 30 * 60 * 1000);

      const token = "token-no-remember";
      await insertSession(userId, token, shortExpiry);

      const result = await applyRememberMeExtension(testDb, token, false);

      // Returned expiresAt should be ~30 min from now
      const thirtyMinMs = 30 * 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(Date.now() + thirtyMinMs - 60_000);
      expect(result.getTime()).toBeLessThanOrEqual(Date.now() + thirtyMinMs + 60_000);

      // DB: expiresAt should NOT have changed
      const sessionRecord = await testDb.query.session.findFirst({
        where: eq(session.token, token),
      });
      expect(sessionRecord).toBeDefined();
      // The DB value should still be close to the original shortExpiry
      expect(Math.abs(sessionRecord!.expiresAt.getTime() - shortExpiry.getTime())).toBeLessThan(2000);
    });

    it("should return expiresAt aligned with what the cookie would use", async () => {
      const { userId } = await createTestUser();
      const now = new Date();
      const shortExpiry = new Date(now.getTime() + 30 * 60 * 1000);

      const token = "token-return-check";
      await insertSession(userId, token, shortExpiry);

      const result = await applyRememberMeExtension(testDb, token, true);

      const thirtyDaysSeconds = 60 * 60 * 24 * 30;
      const diffSeconds = (result.getTime() - Date.now()) / 1000;

      expect(diffSeconds).toBeGreaterThanOrEqual(thirtyDaysSeconds - 60);
      expect(diffSeconds).toBeLessThanOrEqual(thirtyDaysSeconds + 60);
    });
  });

  // ─── destroySession ──────────────────────────────────────────────

  describe("destroySession", () => {
    it("should delete the session from DB and set clear cookie", async () => {
      const { userId } = await createTestUser();
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 60 * 1000);

      const token = "token-to-destroy";
      await insertSession(userId, token, future);

      const headers = new Headers();
      await destroySession(testDb, headers, token);

      // Session deleted
      const deleted = await testDb.query.session.findFirst({
        where: eq(session.token, token),
      });
      expect(deleted).toBeUndefined();

      // Clear cookie set
      const setCookie = headers.get("Set-Cookie");
      expect(setCookie).toContain("__session=");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("should handle null token gracefully", async () => {
      const headers = new Headers();
      await destroySession(testDb, headers, null);

      // Clear cookie should still be set
      const setCookie = headers.get("Set-Cookie");
      expect(setCookie).toContain("__session=");
      expect(setCookie).toContain("Max-Age=0");
    });
  });

  // ─── invalidateAllUserSessions ───────────────────────────────────

  describe("invalidateAllUserSessions", () => {
    it("should delete all sessions for the user", async () => {
      const { userId } = await createTestUser();
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 60 * 1000);

      await insertSession(userId, "token-1", future);
      await insertSession(userId, "token-2", future);
      await insertSession(userId, "token-3", future);

      // Confirm they exist
      const before = await testDb.query.session.findMany({
        where: eq(session.userId, userId),
      });
      expect(before).toHaveLength(3);

      await invalidateAllUserSessions(testDb, userId);

      const after = await testDb.query.session.findMany({
        where: eq(session.userId, userId),
      });
      expect(after).toHaveLength(0);
    });
  });
});
