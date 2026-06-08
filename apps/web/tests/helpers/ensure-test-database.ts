import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DEFAULT_TEST_DB_URL = "postgresql://postgres:password@localhost:5432/web_test";
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_TEST_DB_URL;
}

function toMaintenanceUrl(databaseUrl: URL): URL {
  const maintenanceUrl = new URL(databaseUrl.toString());
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.search = "";
  maintenanceUrl.hash = "";
  return maintenanceUrl;
}

function extractDatabaseName(databaseUrl: URL): string | null {
  const databaseName = databaseUrl.pathname.replace(/^\//, "").trim();
  if (!databaseName || !SAFE_IDENTIFIER.test(databaseName)) {
    return null;
  }
  return databaseName;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureProductStory21Columns(target: ReturnType<typeof postgres>): Promise<void> {
  const productsTableExists = await target<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'products'
    ) as exists
  `;

  if (!productsTableExists[0]?.exists) {
    return;
  }

  const existingColumns = await target<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in ('category', 'unit', 'barcode')
  `;

  const requiredColumns = ["category", "unit", "barcode"];
  const existingColumnSet = new Set(existingColumns.map((column) => column.column_name));
  if (requiredColumns.every((column) => existingColumnSet.has(column))) {
    return;
  }

  await target.unsafe(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
    CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
  `);
}

async function ensureTenantThresholdColumns(target: ReturnType<typeof postgres>): Promise<void> {
  const tenantsTableExists = await target<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'tenants'
    ) as exists
  `;

  if (!tenantsTableExists[0]?.exists) {
    return;
  }

  await target.unsafe(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS default_critical_threshold integer DEFAULT 50 NOT NULL;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS default_attention_threshold integer DEFAULT 100 NOT NULL;

    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS critical_positive;
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS attention_positive;
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS critical_less_than_attention;

    ALTER TABLE tenants
      ADD CONSTRAINT critical_positive CHECK (default_critical_threshold > 0);
    ALTER TABLE tenants
      ADD CONSTRAINT attention_positive CHECK (default_attention_threshold > 0);
    ALTER TABLE tenants
      ADD CONSTRAINT critical_less_than_attention CHECK (
        default_critical_threshold < default_attention_threshold
      );
  `);
}

async function ensureTenantSubscriptionPlanColumn(target: ReturnType<typeof postgres>): Promise<void> {
  const tenantsTableExists = await target<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'tenants'
    ) as exists
  `;

  if (!tenantsTableExists[0]?.exists) {
    return;
  }

  await target.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
        CREATE TYPE subscription_plan AS ENUM ('Free', 'Starter', 'Pro');
      END IF;
    END
    $$;

    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS subscription_plan subscription_plan;
  `);
}

async function ensureProductCustomThresholdColumns(target: ReturnType<typeof postgres>): Promise<void> {
  const productsTableExists = await target<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'products'
    ) as exists
  `;

  if (!productsTableExists[0]?.exists) {
    return;
  }

  await target.unsafe(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS custom_critical_threshold integer;
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS custom_attention_threshold integer;

    ALTER TABLE products DROP CONSTRAINT IF EXISTS product_custom_critical_positive;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS product_custom_attention_positive;
    ALTER TABLE products DROP CONSTRAINT IF EXISTS product_custom_critical_less_than_attention;

    ALTER TABLE products
      ADD CONSTRAINT product_custom_critical_positive
        CHECK (custom_critical_threshold IS NULL OR custom_critical_threshold > 0);
    ALTER TABLE products
      ADD CONSTRAINT product_custom_attention_positive
        CHECK (custom_attention_threshold IS NULL OR custom_attention_threshold > 0);
    ALTER TABLE products
      ADD CONSTRAINT product_custom_critical_less_than_attention
        CHECK (
          (
            custom_critical_threshold IS NULL AND
            custom_attention_threshold IS NULL
          ) OR (
            custom_critical_threshold IS NOT NULL AND
            custom_attention_threshold IS NOT NULL AND
            custom_critical_threshold < custom_attention_threshold
          )
        );
  `);
}

async function ensureAlertsTable(target: ReturnType<typeof postgres>): Promise<void> {
  const alertsTableExists = await target<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'alerts'
    ) as exists
  `;

  if (alertsTableExists[0]?.exists) {
    return;
  }

  await target.unsafe(`
    CREATE TYPE alert_level AS ENUM ('red', 'orange', 'green');
    CREATE TYPE alert_status AS ENUM ('active', 'closed');
    
    CREATE TABLE alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      level alert_level NOT NULL,
      status alert_status NOT NULL DEFAULT 'active',
      stock_at_creation integer NOT NULL,
      current_stock integer NOT NULL,
      handled_at timestamp with time zone,
      snoozed_until timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      closed_at timestamp with time zone
    );
    
    CREATE UNIQUE INDEX idx_alerts_one_active_per_product ON alerts (tenant_id, product_id) WHERE status = 'active';
    CREATE INDEX idx_alerts_tenant_status_level ON alerts (tenant_id, status, level);
    CREATE INDEX idx_alerts_tenant_updated ON alerts (tenant_id, updated_at DESC);
    CREATE INDEX idx_alerts_product_id ON alerts (product_id);
  `);
}

async function ensureStockzenAppRole(target: ReturnType<typeof postgres>): Promise<void> {
  await target.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockzen_app') THEN
        CREATE ROLE stockzen_app WITH LOGIN PASSWORD 'stockzen_app_password' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $$;
    ALTER ROLE stockzen_app SET search_path TO public;
    GRANT USAGE ON SCHEMA public TO stockzen_app;
  `);

  await target.unsafe(`
    DO $$
    DECLARE
      tbl RECORD;
    BEGIN
      FOR tbl IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('tenants', 'tenant_memberships', 'tenant_invitations', 'products', 'stock_movements', 'alerts', 'audit_events', 'users', 'session', 'account', 'verification')
      LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO stockzen_app', tbl.tablename);
      END LOOP;
    END
    $$;
  `);

  await target.unsafe(`
    DO $$
    DECLARE
      seq RECORD;
    BEGIN
      FOR seq IN
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = 'public'
      LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO stockzen_app', seq.sequence_name);
      END LOOP;
    END
    $$;
  `);
}


async function disableForceRlsForTests(target: ReturnType<typeof postgres>): Promise<void> {
  // Disable FORCE ROW LEVEL SECURITY for test database.
  // This allows the postgres superuser to bypass RLS when querying directly,
  // while non-superuser roles (like stockzen_app) remain subject to RLS.
  // RLS is still enabled (for tests that verify RLS behavior via stockzen_app role).
  
  // First disable RLS completely (removes FORCE if it was set)
  await target.unsafe(`
    ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_memberships DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_invitations DISABLE ROW LEVEL SECURITY;
    ALTER TABLE products DISABLE ROW LEVEL SECURITY;
    ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY;
    ALTER TABLE alerts DISABLE ROW LEVEL SECURITY;
  `);
  
  // Then re-enable RLS (without FORCE) so non-superuser roles are still subject to it
  await target.unsafe(`
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
  `);
}

async function ensureAllRlsPolicies(target: ReturnType<typeof postgres>): Promise<void> {
  // Acquire advisory lock to prevent concurrent RLS policy creation
  // Lock key 987654321 is arbitrary but consistent across all test workers
  await target.unsafe(`SELECT pg_advisory_lock(987654321)`);
  
  try {
    // Check if policies already exist (another worker might have created them while we waited)
    const policyCheck = await target`
      SELECT COUNT(*) as count FROM pg_policy 
      WHERE polname IN ('tenant_isolation_select', 'products_isolation_select')
    `;
    
    if (Number(policyCheck[0]?.count || 0) >= 2) {
      // Policies already exist, skip creation
      return;
    }

    // Enable RLS on all tenant-scoped tables
    await target.unsafe(`
      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
    `);

    // Create all missing RLS policies
    await target.unsafe(`
    DO $$
    BEGIN
      -- Tenants table policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_select' AND polrelid = 'public.tenants'::regclass) THEN
        CREATE POLICY tenant_isolation_select ON public.tenants FOR SELECT USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_insert' AND polrelid = 'public.tenants'::regclass) THEN
        CREATE POLICY tenant_isolation_insert ON public.tenants FOR INSERT WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_update' AND polrelid = 'public.tenants'::regclass) THEN
        CREATE POLICY tenant_isolation_update ON public.tenants FOR UPDATE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_delete' AND polrelid = 'public.tenants'::regclass) THEN
        CREATE POLICY tenant_isolation_delete ON public.tenants FOR DELETE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;

      -- Tenant memberships policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_select' AND polrelid = 'public.tenant_memberships'::regclass) THEN
        CREATE POLICY membership_isolation_select ON public.tenant_memberships FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_insert' AND polrelid = 'public.tenant_memberships'::regclass) THEN
        CREATE POLICY membership_isolation_insert ON public.tenant_memberships FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_update' AND polrelid = 'public.tenant_memberships'::regclass) THEN
        CREATE POLICY membership_isolation_update ON public.tenant_memberships FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_delete' AND polrelid = 'public.tenant_memberships'::regclass) THEN
        CREATE POLICY membership_isolation_delete ON public.tenant_memberships FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;

      -- Tenant invitations policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_select' AND polrelid = 'public.tenant_invitations'::regclass) THEN
        CREATE POLICY invitation_isolation_select ON public.tenant_invitations FOR SELECT USING (
          tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
          OR token_hash = current_setting('app.invitation_token_hash', true)
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_insert' AND polrelid = 'public.tenant_invitations'::regclass) THEN
        CREATE POLICY invitation_isolation_insert ON public.tenant_invitations FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_update' AND polrelid = 'public.tenant_invitations'::regclass) THEN
        CREATE POLICY invitation_isolation_update ON public.tenant_invitations FOR UPDATE USING (
          tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
          OR token_hash = current_setting('app.invitation_token_hash', true)
        ) WITH CHECK (
          tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
          OR token_hash = current_setting('app.invitation_token_hash', true)
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_delete' AND polrelid = 'public.tenant_invitations'::regclass) THEN
        CREATE POLICY invitation_isolation_delete ON public.tenant_invitations FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;

      -- Products policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_select' AND polrelid = 'public.products'::regclass) THEN
        CREATE POLICY products_isolation_select ON public.products FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_insert' AND polrelid = 'public.products'::regclass) THEN
        CREATE POLICY products_isolation_insert ON public.products FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_update' AND polrelid = 'public.products'::regclass) THEN
        CREATE POLICY products_isolation_update ON public.products FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_delete' AND polrelid = 'public.products'::regclass) THEN
        CREATE POLICY products_isolation_delete ON public.products FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;

      -- Stock movements policy
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'stock_movements_tenant_isolation' AND polrelid = 'public.stock_movements'::regclass) THEN
        CREATE POLICY stock_movements_tenant_isolation ON public.stock_movements FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;

      -- Audit events policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_isolation_select' AND polrelid = 'public.audit_events'::regclass) THEN
        CREATE POLICY audit_events_isolation_select ON public.audit_events FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_tenant_isolation_insert' AND polrelid = 'public.audit_events'::regclass) THEN
        CREATE POLICY audit_events_tenant_isolation_insert ON public.audit_events FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_no_update' AND polrelid = 'public.audit_events'::regclass) THEN
        CREATE POLICY audit_events_no_update ON public.audit_events FOR UPDATE USING (false);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_no_delete' AND polrelid = 'public.audit_events'::regclass) THEN
        CREATE POLICY audit_events_no_delete ON public.audit_events FOR DELETE USING (false);
      END IF;

      -- Alerts policies
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_select' AND polrelid = 'public.alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_select ON public.alerts FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_insert' AND polrelid = 'public.alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_insert ON public.alerts FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_update' AND polrelid = 'public.alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_update ON public.alerts FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_delete' AND polrelid = 'public.alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_delete ON public.alerts FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
    END
    $$;
  `);
  } finally {
    // Release the advisory lock
    await target.unsafe(`SELECT pg_advisory_unlock(987654321)`).catch(() => {
      // Ignore unlock errors (lock might not be held)
    });
  }
}
async function ensureUsersTableName(target: ReturnType<typeof postgres>): Promise<void> {
  const [legacyUserTable, usersTable] = await Promise.all([
    target<{ exists: boolean }[]>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'user'
      ) as exists
    `,
    target<{ exists: boolean }[]>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'users'
      ) as exists
    `,
  ]);

  if (legacyUserTable[0]?.exists && !usersTable[0]?.exists) {
    await target.unsafe(`ALTER TABLE "user" RENAME TO "users";`);
  }
}

export async function ensureTestDatabaseReady(): Promise<void> {
  const testDatabaseUrlRaw = getTestDatabaseUrl();

  let parsed: URL;
  try {
    parsed = new URL(testDatabaseUrlRaw);
  } catch {
    return;
  }

  const targetDatabase = extractDatabaseName(parsed);
  if (!targetDatabase) {
    return;
  }

  const maintenanceUrl = toMaintenanceUrl(parsed);
  const admin = postgres(maintenanceUrl.toString(), { max: 1 });

  try {
    const existsResult = await admin<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${targetDatabase}) as exists
    `;

    if (!existsResult[0]?.exists) {
      const templateDatabase =
        process.env.TEST_DATABASE_TEMPLATE_DB && SAFE_IDENTIFIER.test(process.env.TEST_DATABASE_TEMPLATE_DB)
          ? process.env.TEST_DATABASE_TEMPLATE_DB
          : "web";

      const templateExistsResult = await admin<{ exists: boolean }[]>`
        select exists(select 1 from pg_database where datname = ${templateDatabase}) as exists
      `;

      const targetSql = quoteIdentifier(targetDatabase);
      const templateSql = quoteIdentifier(templateDatabase);

      if (templateExistsResult[0]?.exists && templateDatabase !== targetDatabase) {
        try {
          await admin.unsafe(`create database ${targetSql} template ${templateSql}`);
        } catch {
          await admin.unsafe(`create database ${targetSql}`);
        }
      } else {
        await admin.unsafe(`create database ${targetSql}`);
      }
    }
  } catch {
    await admin.end({ timeout: 5 });
    return;
  }

  await admin.end({ timeout: 5 });

  const target = postgres(testDatabaseUrlRaw, { max: 1 });
  try {
    // Prevent hanging on stale locks left by abandoned test connections.
    await target.unsafe(`SET lock_timeout = '5s';`);
    await target.unsafe(`SET statement_timeout = '10s';`);

    const tableCheck = await target<{ exists: boolean }[]>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name in ('user', 'users')
      ) as exists
    `;

    if (tableCheck[0]?.exists) {
      await ensureUsersTableName(target);
      await ensureTenantSubscriptionPlanColumn(target);
      await ensureProductStory21Columns(target);
      await ensureTenantThresholdColumns(target);
      await ensureProductCustomThresholdColumns(target);
      await ensureAlertsTable(target);
      await ensureStockzenAppRole(target);

      await disableForceRlsForTests(target);
      await ensureAllRlsPolicies(target);
      return;
    }

    const migrationsDir = path.resolve(process.cwd(), "drizzle/migrations");
    const migrationFiles = (await readdir(migrationsDir))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    for (const migrationFile of migrationFiles) {
      const migrationSql = await readFile(path.join(migrationsDir, migrationFile), "utf8");
      await target.unsafe(migrationSql);
    }

    await ensureUsersTableName(target);
    await ensureTenantSubscriptionPlanColumn(target);
    await ensureProductStory21Columns(target);
    await ensureTenantThresholdColumns(target);
    await ensureProductCustomThresholdColumns(target);
    await ensureAlertsTable(target);
    await ensureStockzenAppRole(target);

    await disableForceRlsForTests(target);
      await ensureAllRlsPolicies(target);
  } catch (error) {
    console.error("Failed to ensure test database is ready:", error);
    throw error;
  } finally {
    await target.end({ timeout: 5 });
  }
}
