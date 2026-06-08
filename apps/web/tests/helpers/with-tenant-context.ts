import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

/**
 * Helper to set the tenant context for database operations in tests.
 * This is necessary because FORCE ROW LEVEL SECURITY applies RLS even to superusers,
 * so we need to explicitly set app.tenant_id for queries to work.
 *
 * @param db - The database instance to use
 * @param tenantId - The tenant ID to set in the session
 * @param callback - The async function to execute with the tenant context set
 */
export async function withTenantContext<T>(
  db: PostgresJsDatabase<typeof schema>,
  tenantId: string,
  callback: () => Promise<T>
): Promise<T> {
  await db.execute(sql`select set_config('app.tenant_id', ${tenantId}, false)`);
  try {
    return await callback();
  } finally {
    await db.execute(sql`RESET app.tenant_id`);
  }
}
