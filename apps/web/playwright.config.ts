import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  // Run DB migrations before any E2E test starts
  globalSetup: "./tests/e2e/global-setup.ts",
  // Auto-start Next.js dev server for E2E tests
  webServer: {
    command: "npx next dev --turbo",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
    },
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/playwright/html-report" }],
    ["junit", { outputFile: "test-results/playwright/junit/results.xml" }],
  ],
  outputDir: "test-results/playwright/artifacts",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
