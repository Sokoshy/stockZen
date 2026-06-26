// @vitest-environment node

import { describe, it, expect, afterEach } from "vitest";

import { getTestDatabaseUrl } from "./test-database";

const DEFAULT = "postgresql://postgres:password@localhost:5432/stockzen_test";

const KEYS = ["TEST_DATABASE_URL", "DATABASE_URL"] as const;
const saved: Record<string, string | undefined> = {};

// getTestDatabaseUrl() reads process.env lazily on each call, so we only need
// to control env vars per test — no module reload required.
function setEnv(env: Record<string, string | undefined>): void {
  for (const key of KEYS) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key] as string;
  }
});

describe("getTestDatabaseUrl precedence", () => {
  it("falls back to the default when neither env var is set", () => {
    setEnv({ TEST_DATABASE_URL: undefined, DATABASE_URL: undefined });
    expect(getTestDatabaseUrl()).toBe(DEFAULT);
  });

  it("uses DATABASE_URL when TEST_DATABASE_URL is unset", () => {
    setEnv({
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://u:p@localhost:5432/other",
    });
    expect(getTestDatabaseUrl()).toBe("postgresql://u:p@localhost:5432/other");
  });

  it("prefers TEST_DATABASE_URL over DATABASE_URL and the default", () => {
    setEnv({
      TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/winner",
      DATABASE_URL: "postgresql://u:p@localhost:5432/loser",
    });
    expect(getTestDatabaseUrl()).toBe("postgresql://u:p@localhost:5432/winner");
  });
});