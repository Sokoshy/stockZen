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
          and table_name = 'user'
      ) as exists
    `;

    if (tableCheck[0]?.exists) {
      await ensureProductStory21Columns(target);
      await ensureTenantThresholdColumns(target);
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

    await ensureProductStory21Columns(target);
    await ensureTenantThresholdColumns(target);
  } catch {
  } finally {
    await target.end({ timeout: 5 });
  }
}
