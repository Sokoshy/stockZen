// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { rateLimit } from "~/server/rate-limit";
import { db } from "~/server/db";
import { rateLimits } from "~/server/db/schema";
import { cleanDatabase, createTestDb } from "../helpers/database";

const testDb = createTestDb();

describe("rate-limit (postgres-backed)", () => {
  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  it("allows up to the limit then denies, sharing state via the database", async () => {
    const key = `test-rl-${Date.now()}`;
    const opts = { limit: 2, windowMs: 60_000 };

    const r1 = await rateLimit(testDb, key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await rateLimit(testDb, key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = await rateLimit(testDb, key, opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);

    // resetAt is stable within the same window
    expect(r1.resetAt).toBe(r2.resetAt);
    expect(r2.resetAt).toBe(r3.resetAt);

    // a row exists in rate_limits; denied calls still increment the counter
    const row = await testDb.query.rateLimits.findFirst({
      where: eq(rateLimits.key, key),
    });
    expect(row).toBeDefined();
    expect(row?.count).toBe(3);
  });
});
