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

  const tablesInDeleteOrder = [
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
