import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTrustedPasswordResetUrl,
  getTrustedPasswordResetRedirectUrl,
  queuePasswordResetEmail,
  sendPasswordResetEmail,
} from "~/server/better-auth/password-reset-email";

describe("password reset email utility", () => {
  beforeEach(() => {
    delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds reset redirect URL from trusted base URL only", () => {
    const redirectUrl = getTrustedPasswordResetRedirectUrl();
    expect(redirectUrl).toBe("http://localhost:3000/reset-password");
  });

  it("builds tokenized reset URL from trusted base URL", () => {
    const resetUrl = buildTrustedPasswordResetUrl("token-value");
    const parsed = new URL(resetUrl);

    expect(parsed.origin).toBe("http://localhost:3000");
    expect(parsed.pathname).toBe("/reset-password");
    expect(parsed.searchParams.get("token")).toBe("token-value");
  });

  it("skips transport call when no webhook is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendPasswordResetEmail({
      userId: "user-1",
      email: "user@example.com",
      token: "token-value",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends webhook payload with trusted reset URL when configured", async () => {
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://example.com/webhooks/reset";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 202,
      })
    );

    await sendPasswordResetEmail({
      userId: "user-1",
      email: "user@example.com",
      token: "token-value",
      webhookUrl: process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://example.com/webhooks/reset");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    const parsedBody = JSON.parse((init as RequestInit).body as string) as {
      template: string;
      to: string;
      resetUrl: string;
    };

    expect(parsedBody.template).toBe("password-reset");
    expect(parsedBody.to).toBe("user@example.com");

    const parsedResetUrl = new URL(parsedBody.resetUrl);
    expect(parsedResetUrl.origin).toBe("http://localhost:3000");
    expect(parsedResetUrl.pathname).toBe("/reset-password");
    expect(parsedResetUrl.searchParams.get("token")).toBe("token-value");

  });

  it("throws when webhook transport returns non-2xx", async () => {
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://example.com/webhooks/reset";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 500,
      })
    );

    await expect(
      sendPasswordResetEmail({
        userId: "user-1",
        email: "user@example.com",
        token: "token-value",
        webhookUrl: process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL,
      })
    ).rejects.toThrow(/transport returned 500/i);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("times out and retries once on abort errors", async () => {
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://example.com/webhooks/reset";

    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(
      sendPasswordResetEmail({
        userId: "user-1",
        email: "user@example.com",
        token: "token-value",
        webhookUrl: process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL,
      })
    ).rejects.toThrow(/timed out/i);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("queues async delivery without blocking caller", () => {
    const result = queuePasswordResetEmail({
      userId: "user-1",
      email: "user@example.com",
      token: "token-value",
    });

    expect(result).toBeUndefined();
  });
});
