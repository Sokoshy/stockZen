import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    // Ensure server-side environment variables are accessible
    env: {
      NODE_ENV: "test",
    },
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
