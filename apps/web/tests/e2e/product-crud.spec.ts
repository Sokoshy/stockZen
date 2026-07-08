import { test, expect } from "../support/fixtures";
import { seedAndLogin } from "../support/helpers/e2e-seed";

test.describe("Product CRUD", () => {
  test.beforeEach(async ({ page, context, request }) => {
    await seedAndLogin(request, context);
  });

  test("[P0] creates a product online and sees it in the list", async ({ page }) => {
    // Navigate to create product
    await page.goto("/products/create");
    await expect(page.getByTestId("create-product-form")).toBeVisible();

    // Fill required fields
    await page.fill("#name", "Test Product E2E");
    await page.fill("#category", "Testing");
    await page.fill("#unit", "pcs");
    await page.fill("#price", "29.99");
    await page.fill("#quantity", "100");

    // Submit
    await page.getByTestId("create-product-submit").click();

    // Verify redirect to products list
    await page.waitForURL("**/products");
    await expect(page.getByTestId("products-page")).toBeVisible();
    await expect(page.getByTestId("mobile-products-list")).toContainText("Test Product E2E");
  });

  test("[P0] creates a product offline", async ({ page }) => {
    await page.goto("/products/create");
    await expect(page.getByTestId("create-product-form")).toBeVisible();

    // Check offline mode
    await page.getByTestId("offline-checkbox").check();

    // Intercept tRPC create to simulate offline
    await page.route("**/api/trpc/products.create*", (route) => route.abort("internetdisconnected"));

    // Fill required fields
    await page.fill("#name", "Offline Product E2E");
    await page.fill("#category", "Testing");
    await page.fill("#unit", "box");
    await page.fill("#price", "15.50");
    await page.fill("#quantity", "50");

    // Submit
    await page.getByTestId("create-product-submit").click();

    // Verify redirect and offline product visible
    await page.waitForURL("**/products");
    await expect(page.getByTestId("products-page")).toBeVisible();
    await expect(page.getByTestId("mobile-products-list")).toContainText("Offline Product E2E");

    // Verify sync status indicator shows "pending" (first product row should have pending)
    const pendingStatus = page.locator('[data-testid^="sync-status-"]').first();
    await expect(pendingStatus).toContainText(/pending/i);
  });
});
