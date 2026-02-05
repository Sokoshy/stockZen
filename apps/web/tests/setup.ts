process.env.SKIP_ENV_VALIDATION = "true";
// Use the main database for integration tests in development
// In production CI, you would use a separate test database
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:5432/web";

import "@testing-library/jest-dom";
