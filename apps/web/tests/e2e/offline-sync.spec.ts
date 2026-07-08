import { test, expect } from "../support/fixtures";
import { seedAndLogin } from "../support/helpers/e2e-seed";

test.describe("Offline Sync", () => {
  test.beforeEach(async ({ page, context, request }) => {
    await seedAndLogin(request, context);
  });

  test("[P0] creates product offline and shows pending status", async ({ page }) => {
    // Navigate to create product page while online (so Next.js bundles are cached)
    await page.goto("/products/create");
    await expect(page.getByTestId("create-product-form")).toBeVisible();

    // Check offline mode
    await page.getByTestId("offline-checkbox").check();

    // Intercept tRPC API calls to simulate offline mode for the API
    // (More reliable than context.setOffline() which also blocks Next.js asset loading)
    await page.route("**/api/trpc/products.create*", (route) => route.abort("internetdisconnected"));

    // Fill required fields
    await page.fill("#name", "Sync Test Product");
    await page.fill("#category", "Testing");
    await page.fill("#unit", "kg");
    await page.fill("#price", "99.99");
    await page.fill("#quantity", "10");

    // Submit
    await page.getByTestId("create-product-submit").click();

    // Verify redirect to products list and product visible
    await page.waitForURL("**/products");
    await expect(page.getByTestId("products-page")).toBeVisible();
    await expect(page.getByTestId("mobile-products-list")).toContainText("Sync Test Product");

    // Verify pending sync status (product was created offline)
    const pendingStatus = page.locator('[data-testid^="sync-status-"]').first();
    await expect(pendingStatus).toContainText(/pending/i);
  });
});
