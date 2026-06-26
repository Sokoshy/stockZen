import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import * as schema from "~/server/db/schema";

export function getTestDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:password@localhost:5432/stockzen_test"
  );
}

// Snapshot for callers that want a one-time resolved value (wiring stays simple).
export const TEST_DATABASE_URL: string = getTestDatabaseUrl();

export async function ensureTestDatabaseReady(): Promise<void> {
  const url = getTestDatabaseUrl();
  const targetDatabaseName = "stockzen_test";

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.search = "";
  maintenanceUrl.hash = "";

  const admin = postgres(maintenanceUrl.toString(), { max: 1 });
  // ponytail: target DB name fixed to stockzen_test; matches the default URL and init-db.sql.
  try {
    const exists = await admin<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${targetDatabaseName}) AS exists
    `;
    if (!exists[0]?.exists) {
      await admin.unsafe(`CREATE DATABASE "${targetDatabaseName}"`);
    }
  } catch (error) {
    console.error("Failed to ensure test database exists:", error);
    throw error;
  } finally {
    await admin.end({ timeout: 5 });
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle/migrations"),
    });
  } catch (error) {
    console.error("Failed to run test database migrations:", error);
    throw error;
  } finally {
    await client.end({ timeout: 5 });
  }
}