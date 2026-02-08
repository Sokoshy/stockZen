import { sql } from "drizzle-orm";

import { db } from "./index";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

type DbClient = Pick<PostgresJsDatabase<typeof schema>, "execute">;

/**
 * Set the tenant context for RLS policies
 * This must be called before any tenant-scoped queries
 * 
 * Usage:
 * ```ts
 * await setTenantContext(tenantId);
 * // Now all queries will be filtered by RLS
 * const data = await db.select().from(someTenantScopedTable);
 * ```
 */
export async function setTenantContext(
  tenantId: string | null,
  client: DbClient = db
): Promise<void> {
  const value = tenantId ?? "";
  await client.execute(sql`SELECT set_config('app.tenant_id', ${value}, true)`);
  if (tenantId) {
    await client.execute(sql`SELECT set_config('row_security', 'on', true)`);
  }
}

/**
 * Set invitation token hash context for public invitation operations.
 *
 * This enables RLS policies that allow selecting/updating a single
 * invitation row based on the hashed token value without exposing
 * cross-tenant invitation data.
 */
export async function setInvitationTokenContext(
  tokenHash: string,
  client: DbClient = db
): Promise<void> {
  await client.execute(
    sql`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`
  );
  await client.execute(sql`SELECT set_config('row_security', 'on', true)`);
}

/**
 * Clear the tenant context
 * Use this when you need to bypass RLS (e.g., for admin operations)
 */
export async function clearTenantContext(client: DbClient = db): Promise<void> {
  await client.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
  await client.execute(sql`SELECT set_config('row_security', 'off', true)`);
}

/**
 * Get the current tenant context
 * Returns null if no context is set
 */
export async function getTenantContext(client: DbClient = db): Promise<string | null> {
  const result = await client.execute(
    sql`SELECT current_setting('app.tenant_id', true) as tenant_id`
  );
  const tenantId = result[0]?.tenant_id as string | undefined;
  return tenantId || null;
}

export async function withTenantContext<T>(
  tenantId: string,
  action: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenantContext(tenantId, tx);
    return action(tx);
  });
}
