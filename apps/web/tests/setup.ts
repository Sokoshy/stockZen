process.env.SKIP_ENV_VALIDATION = "true";
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? "test-secret-32-characters-long";
process.env.BETTER_AUTH_BASE_URL =
  process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:3000";
process.env.BETTER_AUTH_GITHUB_CLIENT_ID =
  process.env.BETTER_AUTH_GITHUB_CLIENT_ID ?? "test-github-client-id";
process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET =
  process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ?? "test-github-client-secret";
process.env.BETTER_AUTH_GITHUB_REDIRECT_URI =
  process.env.BETTER_AUTH_GITHUB_REDIRECT_URI ??
  "http://localhost:3000/api/auth/callback/github";
// Use a dedicated test database for integration tests
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/web_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import "@testing-library/jest-dom";
