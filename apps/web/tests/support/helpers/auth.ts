import type { BrowserContext } from "@playwright/test";

type AuthSessionOptions = {
  baseUrl?: string;
  cookieName?: string;
  cookieValue?: string;
};

export async function setAuthenticatedSession(context: BrowserContext, options: AuthSessionOptions = {}): Promise<void> {
  const url = new URL(options.baseUrl ?? process.env.BASE_URL ?? "http://localhost:3000");

  await context.addCookies([
    {
      name: options.cookieName ?? "test-auth-session",
      value: options.cookieValue ?? "session-token",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    },
  ]);
}
