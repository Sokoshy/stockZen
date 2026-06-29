import { sql } from "drizzle-orm";

import { db } from "~/server/db";
import { rateLimits } from "~/server/db/schema";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? forwardedFor.trim();
  }

  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

// ponytail: pas de cron vacuum ; reset paresseux. Ajouter si la table grossit.
export async function rateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = new Date();
  const nextResetAt = new Date(now.getTime() + options.windowMs);
  const nowIso = now.toISOString();
  const nextResetIso = nextResetAt.toISOString();

  const rows = await db
    .insert(rateLimits)
    .values({ key: identifier, count: 1, resetAt: nextResetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN ${nextResetIso}::timestamptz ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const row = rows[0];
  if (!row) {
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      resetAt: nextResetAt.getTime(),
    };
  }

  const count = row.count;
  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    resetAt: row.resetAt.getTime(),
  };
}
