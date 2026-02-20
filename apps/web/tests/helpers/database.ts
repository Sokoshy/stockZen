import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "~/server/db/schema";

// Test database connection string (use a separate test database in production)
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/web_test";

// Create a test database client
export function createTestDb() {
  const client = postgres(TEST_DATABASE_URL);
  return drizzle(client, { schema });
}

// Clean up tables before/after tests
export async function cleanDatabase(db: ReturnType<typeof createTestDb>) {
  const client = await db.$client;

  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_type') THEN
        CREATE TYPE audit_action_type AS ENUM (
          'login',
          'logout',
          'password_reset_completed',
          'invite_created',
          'invite_revoked',
          'role_changed',
          'member_removed',
          'login_failed',
          'forbidden_attempt'
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_status') THEN
        CREATE TYPE audit_status AS ENUM ('success', 'failure');
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_level') THEN
        CREATE TYPE alert_level AS ENUM ('red', 'orange', 'green');
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
        CREATE TYPE alert_status AS ENUM ('active', 'closed');
      END IF;
    END
    $$;
  `);

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "audit_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
      "actor_user_id" text,
      "action_type" audit_action_type NOT NULL,
      "target_type" varchar(100),
      "target_id" text,
      "status" audit_status NOT NULL,
      "context" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "alerts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
      "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "level" alert_level NOT NULL,
      "status" alert_status NOT NULL DEFAULT 'active',
      "stock_at_creation" integer NOT NULL,
      "current_stock" integer NOT NULL,
      "handled_at" timestamp with time zone,
      "snoozed_until" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "closed_at" timestamp with time zone
    );
  `);

  await client.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_alerts_one_active_per_product" ON "alerts" ("tenant_id", "product_id") WHERE "status" = 'active';
  `);

  await client.unsafe(`
    ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "handled_at" timestamp with time zone;
    ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp with time zone;
  `);

  const tablesInDeleteOrder = [
    "alerts",
    "audit_events",
    "products",
    "tenant_invitations",
    "tenant_memberships",
    "tenants",
    "session",
    "account",
    "verification",
    "user",
  ];

  // Delete in order to respect foreign key constraints.
  // Some local test databases may not yet have newer tables.
  for (const tableName of tablesInDeleteOrder) {
    try {
      await client.unsafe(`DELETE FROM "${tableName}"`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01") {
        throw error;
      }
    }
  }
}

// Generate unique test data
export function generateTestEmail(prefix?: string) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  return `test-${prefix ? `${prefix}-` : ""}${uniqueId}@example.com`;
}

export function generateTestTenantName(prefix?: string) {
  return `Test Org ${prefix ? `${prefix} ` : ""}${Date.now()}`;
}
