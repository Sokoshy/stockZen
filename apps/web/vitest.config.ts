import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // ponytail: run DB migration ONCE here (main process), not per test file.
    // See tests/global-setup.ts.
    globalSetup: ["./tests/global-setup.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    // Ensure server-side environment variables are accessible
    env: {
      NODE_ENV: "test",
    },
    projects: [
      {
        // Fast, stateless unit/component/ui tests — run in parallel.
        extends: true,
        test: {
          name: "unit",
          include: [
            "tests/unit/**",
            "tests/ui/**",
            "tests/helpers/*.test.ts",
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "src/**/*.spec.ts",
          ],
          exclude: ["src/server/api/routers/__tests__/**"],
        },
      },
      {
        // DB-backed integration tests — serial. They share one stockzen_test
        // database cleaned via TRUNCATE in beforeEach, so parallel files would
        // corrupt each other's data. fileParallelism:false keeps that contract.
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: [
            "tests/integration/**",
            "src/server/api/routers/__tests__/**",
          ],
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/helpers/server-only.ts"),
    },
  },
  // Prevent tree-shaking of server-side code
  ssr: {
    noExternal: ["@t3-oss/env-nextjs"],
  },
});