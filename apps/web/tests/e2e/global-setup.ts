// Playwright globalSetup: ensure test DB exists and migrations are run
// before any E2E test starts. This runs in the test runner process,
// so env vars must be set explicitly here.
import { ensureTestDatabaseReady } from "../helpers/test-database";

export default async function globalSetup() {
  // Set env vars explicitly for this process — they won't leak from webServer
  process.env.TEST_DATABASE_URL ??= "postgresql://postgres:password@localhost:5432/stockzen_test";
  process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET ??= "sVA12N8tsaLjxySlF8zxoCd8YJElIzoeNa3GGYyo6aI=";
  process.env.BETTER_AUTH_BASE_URL ??= "http://localhost:3000";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";

  await ensureTestDatabaseReady();
}
