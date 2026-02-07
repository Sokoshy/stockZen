import { env } from "~/lib/env";

const SESSION_COOKIE_NAME = "__session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionCookieInput = {
  token: string;
  expiresAt?: Date | string | null;
  persistent?: boolean;
};

function normalizeExpiresAt(expiresAt?: Date | string | null): Date | null {
  if (!expiresAt) {
    return null;
  }

  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCookieParts(name: string, value: string, expiresAt?: Date | null): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  const secure = env.NODE_ENV === "production";
  const sameSite = "Lax";

  const normalizedExpiresAt = normalizeExpiresAt(expiresAt);
  if (normalizedExpiresAt) {
    const maxAgeSeconds = Math.max(
      0,
      Math.floor((normalizedExpiresAt.getTime() - Date.now()) / 1000)
    );
    parts.push(`Max-Age=${maxAgeSeconds}`);
    parts.push(`Expires=${normalizedExpiresAt.toUTCString()}`);
  } else {
    parts.push(`Max-Age=${DEFAULT_SESSION_MAX_AGE_SECONDS}`);
  }

  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push(`SameSite=${sameSite}`);
  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildSessionCookie(input: SessionCookieInput): string {
  const normalizedExpiresAt = normalizeExpiresAt(input.expiresAt);

  if (input.persistent) {
    return buildCookieParts(SESSION_COOKIE_NAME, input.token, normalizedExpiresAt);
  }

  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(input.token)}`];
  const secure = env.NODE_ENV === "production";

  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE_NAME}=`];
  const secure = env.NODE_ENV === "production";

  parts.push("Max-Age=0");
  parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function extractSessionToken(result: unknown): {
  token: string | null;
  expiresAt: Date | string | null;
  setCookie: string | null;
} {
  if (!result || typeof result !== "object") {
    return { token: null, expiresAt: null, setCookie: null };
  }

  if ("session" in result) {
    const session = (result as { session?: { token?: string; expiresAt?: Date | string } }).session;
    if (session?.token) {
      return {
        token: session.token,
        expiresAt: session.expiresAt ?? null,
        setCookie: null,
      };
    }
  }

  if ("token" in result) {
    const token = (result as { token?: string | null }).token;
    if (typeof token === "string" && token.length > 0) {
      return { token, expiresAt: null, setCookie: null };
    }
  }

  if ("sessionToken" in result) {
    const sessionToken = (result as { sessionToken?: string }).sessionToken;
    if (typeof sessionToken === "string") {
      return { token: sessionToken, expiresAt: null, setCookie: null };
    }
  }

  if ("headers" in result) {
    const headers = (result as { headers?: Headers }).headers;
    if (headers instanceof Headers) {
      const setCookie = headers.get("set-cookie");
      if (setCookie) {
        return { token: null, expiresAt: null, setCookie };
      }
    }
  }

  return { token: null, expiresAt: null, setCookie: null };
}
