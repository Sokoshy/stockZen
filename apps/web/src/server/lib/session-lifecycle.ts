import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  buildClearSessionCookie,
  buildSessionCookie,
} from "~/server/better-auth/session-cookie";
import { session } from "~/server/db/schema";
import type * as schema from "~/server/db/schema";

type DbClient = PostgresJsDatabase<typeof schema>;

const REMEMBER_ME_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 30;

/**
 * Extend or keep the current session's expiry based on the rememberMe flag.
 *
 * - rememberMe = true  → expiresAt = now + 30 days (DB update)
 * - rememberMe = false → expiresAt = now + 30 min  (no DB update)
 *
 * @returns The computed `expiresAt` that the caller should use for the cookie.
 */
export async function applyRememberMeExtension(
  db: DbClient,
  currentToken: string | null,
  rememberMe: boolean,
): Promise<Date> {
  const now = new Date();
  const ttlSeconds = rememberMe
    ? REMEMBER_ME_SESSION_TTL_SECONDS
    : DEFAULT_SESSION_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  if (rememberMe && currentToken) {
    await db
      .update(session)
      .set({
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(session.token, currentToken));
  }

  return expiresAt;
}

/**
 * Set the session cookie on the response headers after a successful auth
 * (login or sign-up).
 *
 * @param token - The session token to encode in the cookie.
 * @returns The token string that was set.
 */
export function setSessionCookieAfterAuth(
  responseHeaders: Headers,
  token: string,
  rememberMe: boolean,
  sessionExpiresAt: Date,
): string {
  responseHeaders.append(
    "Set-Cookie",
    buildSessionCookie({
      token,
      expiresAt: rememberMe ? sessionExpiresAt : undefined,
      persistent: rememberMe,
    }),
  );
  return token;
}

/**
 * Delete a single session from the DB (by token) and append the
 * clear-cookie header to the response.
 */
export async function destroySession(
  db: DbClient,
  responseHeaders: Headers,
  currentToken: string | null,
): Promise<void> {
  if (currentToken) {
    await db.delete(session).where(eq(session.token, currentToken));
  }

  responseHeaders.append("Set-Cookie", buildClearSessionCookie());
}

/**
 * Delete all sessions globally for a given user (e.g. after role revocation
 * or forced logout). This affects ALL tenants the user belongs to.
 */
export async function globallyInvalidateAllUserSessions(
  db: DbClient,
  userId: string,
): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId));
}
