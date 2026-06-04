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

async function ensureForceRls(target: ReturnType<typeof postgres>): Promise<void> {
  const tenantScopedTables = [
    "tenants",
    "tenant_memberships",
    "tenant_invitations",
    "products",
    "stock_movements",
    "alerts",
    "audit_events",
  ];

  for (const tableName of tenantScopedTables) {
    const tableExists = await target<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relname = ${tableName}
          AND relkind = 'r'
      ) AS exists
    `;

    if (tableExists[0]?.exists) {
      await target.unsafe(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY`);
    }
  }
}

async function ensureAlertsRls(target: ReturnType<typeof postgres>): Promise<void> {
  const alertsTableExists = await target<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE relname = 'alerts'
        AND relkind = 'r'
    ) AS exists
  `;

  if (!alertsTableExists[0]?.exists) {
    return;
  }

  await target.unsafe(`ALTER TABLE alerts ENABLE ROW LEVEL SECURITY`);

  await target.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_select' AND polrelid = 'alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_select ON alerts FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_insert' AND polrelid = 'alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_insert ON alerts FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_update' AND polrelid = 'alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_update ON alerts FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_delete' AND polrelid = 'alerts'::regclass) THEN
        CREATE POLICY alerts_tenant_isolation_delete ON alerts FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
      END IF;
    END
    $$;
  `);
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
      await ensureForceRls(target);
      await ensureAlertsRls(target);
      return;
    }

    const migrationsDir = path.resolve(process.cwd(), "drizzle");
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
    await ensureForceRls(target);
    await ensureAlertsRls(target);
  } catch {
  } finally {
    await target.end({ timeout: 5 });
  }
}
