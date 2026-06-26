import { getTableName, is, Table } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "~/server/db/schema";
import { getTestDatabaseUrl } from "./test-database";

// Test database connection string (use a separate test database in production)
const TEST_DATABASE_URL = getTestDatabaseUrl();

// ponytail: one shared connection for the whole worker process. Integration tests
// are serial (fileParallelism:false on the integration vitest project), so a
// single max:1 connection is enough and we never exhaust Postgres' pool.
// Upgrade path: drop the singleton and add per-test DB isolation if you enable
// parallel integration tests.
let sharedClient: ReturnType<typeof postgres> | null = null;

// Create a test database client
export function createTestDb() {
  sharedClient ??= postgres(TEST_DATABASE_URL, { max: 1 });
  return drizzle(sharedClient, { schema });
}

// Clean up tables before/after tests
export async function cleanDatabase(db: ReturnType<typeof createTestDb>) {
  const client = await db.$client;

  await client.unsafe(`ROLLBACK`).catch(() => {});

  // Reset tenant context to allow superuser to bypass RLS for cleanup.
  // RESET on an unset custom GUC never errors, so no catch here.
  await client.unsafe(`RESET app.tenant_id`);

  // Terminate backends left "idle in transaction" (incl. aborted, 25P02) on the test
  // DB — e.g. the prod DB singleton (src/server/db/index.ts globalThis.conn) lingering
  // after a tRPC mutation — so the TRUNCATE/CASCADE below can acquire ACCESS EXCLUSIVE.
  // Serial integration tests => safe to terminate between tests (no in-flight query).
  // ponytail: requires SUPERUSER (testDb connects as postgres); a non-superuser CI role
  // would silently no-op the terminate and the deadlock would return. Excludes 'active'
  // intentionally so legitimate concurrent queries are never killed.
  // (uses: db.$client)
  const terminateResult = await client<{ pg_terminate_backend: boolean }[]>`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state LIKE 'idle in transaction%'
      AND pid <> pg_backend_pid()
  `;

  const terminated = terminateResult.map((row) => row.pg_terminate_backend);
  if (terminated.length > 0 && !terminated.some((terminated) => terminated)) {
    throw new Error(
      `Found ${terminated.length} idle-in-transaction backend(s) but could not terminate any. ` +
        "The test database role needs SUPERUSER or ownership of those sessions for pg_terminate_backend to work.",
    );
  }

  const tablesInDeleteOrder = (Object.values(schema) as unknown[])
    .filter((value): value is Table => is(value, Table))
    .map((table) => getTableName(table));

  await client.unsafe(
    `TRUNCATE TABLE ${tablesInDeleteOrder.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
}

// Generate unique test data
export function generateTestEmail(prefix?: string) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return `test-${prefix ? `${prefix}-` : ""}${uniqueId}@example.com`;
}

export function generateTestTenantName(prefix?: string) {
  return `Test Org ${prefix ? `${prefix} ` : ""}${Date.now()}`;
}
