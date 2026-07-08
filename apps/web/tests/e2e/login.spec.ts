import { test, expect } from "../support/fixtures";
import { seedUserViaApi } from "../support/helpers/e2e-seed";

test.describe("Login", () => {
  test("[P0] signs up a new user via API, logs in via UI", async ({ page, request }) => {
    // Arrange: seed user via API (fast, reliable)
    const { email, password } = await seedUserViaApi(request);

    // Act: login via UI
    await page.goto("/login");
    await expect(page.getByTestId("login-page")).toBeVisible();
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByTestId("login-submit").click();

    // Assert: redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test("[P0] shows error on invalid credentials",
  { annotation: [{ type: "skipNetworkMonitoring" }] },
  async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-page")).toBeVisible();

    await page.fill("#email", "wrong@example.com");
    await page.fill("#password", "wrongpassword");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page.getByTestId("login-error")).toContainText(/invalid|error|incorrect/i);
  });
});
