import { test, expect } from "../support/fixtures";
import { createUser } from "../support/factories/user-factory";
import { mockJsonRoute } from "../support/helpers/network";

test("[P0] loads mocked products with network-first interception", async ({ page, cleanup }) => {
  // Given
  const user = createUser({ role: "admin" });
  await mockJsonRoute(page, "**/api/products*", {
    items: [{ id: "prod-1", name: "Flour T55", owner: user.name }],
  });
  cleanup.add(async () => {
    await page.unroute("**/api/products*");
  });

  // When
  await page.goto("about:blank");
  await page.setContent(`
    <main>
      <h1 data-testid="products-title">Products</h1>
      <button data-testid="load-products">Load products</button>
      <ul data-testid="products-list"></ul>
    </main>
    <script>
      const button = document.querySelector('[data-testid="load-products"]');
      const list = document.querySelector('[data-testid="products-list"]');

      button.addEventListener('click', async () => {
        const response = await fetch('https://stockzen.local/api/products?tenant=demo');
        const data = await response.json();
        list.innerHTML = data.items.map((item) => '<li>' + item.name + '</li>').join('');
      });
    </script>
  `);
  await page.getByTestId("load-products").click();

  // Then
  await expect(page.getByTestId("products-list")).toContainText("Flour T55");
});
