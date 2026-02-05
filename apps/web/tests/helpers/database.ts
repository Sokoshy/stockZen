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
  
  // Delete in order to respect foreign key constraints
  await client`DELETE FROM "tenant_memberships"`;
  await client`DELETE FROM "tenants"`;
  await client`DELETE FROM "session"`;
  await client`DELETE FROM "account"`;
  await client`DELETE FROM "verification"`;
  await client`DELETE FROM "user"`;
}

// Generate unique test data
export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

export function generateTestTenantName() {
  return `Test Org ${Date.now()}`;
}
