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

  const tablesInDeleteOrder = [
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
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

export function generateTestTenantName() {
  return `Test Org ${Date.now()}`;
}
