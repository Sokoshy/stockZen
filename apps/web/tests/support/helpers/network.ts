import type { Page, Route } from "@playwright/test";

export async function mockJsonRoute(page: Page, urlPattern: string | RegExp, payload: unknown, status = 200): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify(payload),
    });
  });
}
