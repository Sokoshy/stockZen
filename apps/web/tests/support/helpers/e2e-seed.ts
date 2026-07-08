import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { generateTestEmail } from "../../helpers/database";

export type SeedUserResult = {
  email: string;
  password: string;
  tenantId: string;
  userId: string;
};

/**
 * Crée un utilisateur + tenant via l'API tRPC directement.
 * Beaucoup plus rapide et fiable que de passer par le formulaire UI.
 * Retourne email/mot de passe tenantId pour les tests.
 * Réessaie avec backoff en cas de rate limiting (429).
 */
export async function seedUserViaApi(
  request: APIRequestContext
): Promise<SeedUserResult> {
  const email = generateTestEmail("e2e");
  const password = "Password123";
  const tenantName = `E2E Test ${Date.now()}`;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await request.fetch("/api/trpc/auth.signUp?batch=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        "0": {
          json: {
            email,
            password,
            confirmPassword: password,
            tenantName,
            rememberMe: false,
          },
        },
      },
    });

    if (response.ok()) {
      const body = await response.json();
      const result0 = body?.[0]?.result?.data?.json;
      const tenantId = result0?.tenant?.id;
      const userId = result0?.user?.id;

      if (!tenantId || !userId) {
        throw new Error(`seedUserViaApi: missing tenantId/userId in response: ${JSON.stringify(body)}`);
      }

      return { email, password, tenantId, userId };
    }

    // Rate limited — wait and retry
    if (response.status() === 429 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      continue;
    }

    const text = await response.text();
    throw new Error(`seedUserViaApi signup failed (${response.status()}): ${text}`);
  }

  throw new Error("seedUserViaApi: max retries exceeded");
}

/**
 * Effectue la connexion via l'API Better Auth et retourne la session cookie string.
 * La cookie peut être injectée dans le contexte navigateur avec setSessionCookie().
 */
export async function loginUserViaApi(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const response = await request.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ponytail: Better Auth requires Origin for sign-in.
      Origin: "http://localhost:3000",
    },
    data: { email, password, rememberMe: false, callbackURL: "/dashboard" },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`loginUserViaApi failed (${response.status()}): ${text}`);
  }

  // Extract Set-Cookie header
  const cookies = response.headers()["set-cookie"];
  if (!cookies) {
    throw new Error("loginUserViaApi: no Set-Cookie header in response");
  }

  const sessionCookie = typeof cookies === "string" ? cookies : cookies[0];
  if (!sessionCookie) {
    throw new Error("loginUserViaApi: could not extract session cookie");
  }

  return sessionCookie;
}

/**
 * Ajoute la session Better Auth au contexte navigateur Playwright.
 */
export async function setSessionCookie(
  context: BrowserContext,
  sessionCookieHeader: string
): Promise<void> {
  // ponytail: hardcoded localhost — always the Playwright dev-server host.
  // Only needs extraction if tests run against remote environments.
  const cookieParts = sessionCookieHeader.split(";")[0]?.trim();
  if (!cookieParts) throw new Error("setSessionCookie: empty cookie header");

  const eqIdx = cookieParts.indexOf("=");
  if (eqIdx === -1) throw new Error("setSessionCookie: no '=' in cookie");

  const name = cookieParts.slice(0, eqIdx);
  const value = cookieParts.slice(eqIdx + 1);

  await context.addCookies([
    {
      name,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Encapsule le beforeEach commun seed + login + setSessionCookie */
export async function seedAndLogin(
  request: APIRequestContext,
  context: BrowserContext
): Promise<SeedUserResult> {
  const { email, password, tenantId, userId } = await seedUserViaApi(request);
  const sessionCookie = await loginUserViaApi(request, email, password);
  await setSessionCookie(context, sessionCookie);
  return { email, password, tenantId, userId };
}
