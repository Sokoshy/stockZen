import { db } from "./index";

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
export async function setTenantContext(tenantId: string | null): Promise<void> {
  const client = await db.$client;
  
  if (tenantId) {
    await client`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  } else {
    await client`SELECT set_config('app.tenant_id', '', true)`;
  }
}

/**
 * Clear the tenant context
 * Use this when you need to bypass RLS (e.g., for admin operations)
 */
export async function clearTenantContext(): Promise<void> {
  const client = await db.$client;
  await client`SELECT set_config('app.tenant_id', '', true)`;
}

/**
 * Get the current tenant context
 * Returns null if no context is set
 */
export async function getTenantContext(): Promise<string | null> {
  const client = await db.$client;
  const result = await client`SELECT current_setting('app.tenant_id', true) as tenant_id`;
  const tenantId = result[0]?.tenant_id;
  return tenantId || null;
}
