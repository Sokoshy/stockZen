import { ensureTestDatabaseReady } from "./helpers/test-database";

// ponytail: runs once in the main process before any worker spawns, so DB
// migration/import isn't repeated per test file (was the dominant cost: it ran
// via tests/setup.ts before every file). Worker test.env isn't visible here,
// so ensureTestDatabaseReady falls back to the default stockzen_test URL —
// matches tests/setup.ts and createTestDb.
export default async function setup(): Promise<void> {
  await ensureTestDatabaseReady();
}