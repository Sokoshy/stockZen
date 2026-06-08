import { defineConfig } from "drizzle-kit";

import { env } from "~/lib/env";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  out: "./drizzle/migrations",
});
