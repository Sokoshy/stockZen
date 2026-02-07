import { env } from "~/lib/env";
import { logger } from "~/server/logger";

const RESET_PASSWORD_PATH = "/reset-password";
const EMAIL_TRANSPORT_TIMEOUT_MS = 5_000;
const EMAIL_TRANSPORT_MAX_ATTEMPTS = 2;
const EMAIL_TRANSPORT_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

type PasswordResetEmailInput = {
  userId: string;
  email: string;
  token: string;
  webhookUrl?: string;
};

type PasswordResetWebhookPayload = {
  template: "password-reset";
  to: string;
  resetUrl: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeTransportError(error: unknown): Error {
  if (isAbortError(error)) {
    return new Error(
      `Password reset email transport timed out after ${EMAIL_TRANSPORT_TIMEOUT_MS}ms`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Password reset email transport failed");
}

async function postPasswordResetWebhook(
  webhookUrl: string,
  payload: PasswordResetWebhookPayload
): Promise<void> {
  let attempt = 0;

  while (attempt < EMAIL_TRANSPORT_MAX_ATTEMPTS) {
    attempt += 1;
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, EMAIL_TRANSPORT_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const transportError = new Error(
          `Password reset email transport returned ${response.status}`
        );
        const isRetryableStatus = EMAIL_TRANSPORT_RETRYABLE_STATUSES.has(
          response.status
        );

        if (attempt < EMAIL_TRANSPORT_MAX_ATTEMPTS && isRetryableStatus) {
          await sleep(150 * attempt);
          continue;
        }

        throw transportError;
      }

      return;
    } catch (error) {
      const isRetryableError =
        (isAbortError(error) || error instanceof TypeError) &&
        attempt < EMAIL_TRANSPORT_MAX_ATTEMPTS;

      if (isRetryableError) {
        await sleep(150 * attempt);
        continue;
      }

      throw normalizeTransportError(error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error("Password reset email transport failed after retries");
}

export function getTrustedPasswordResetRedirectUrl(): string {
  return new URL(RESET_PASSWORD_PATH, env.BETTER_AUTH_BASE_URL).toString();
}

export function buildTrustedPasswordResetUrl(token: string): string {
  const resetUrl = new URL(RESET_PASSWORD_PATH, env.BETTER_AUTH_BASE_URL);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const webhookUrl = input.webhookUrl ?? env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.info(
      {
        event: "audit.auth.password_reset.email_delivery.skipped",
        userId: input.userId,
      },
      "Password reset email transport is not configured"
    );
    return;
  }

  const resetUrl = buildTrustedPasswordResetUrl(input.token);

  await postPasswordResetWebhook(webhookUrl, {
    template: "password-reset",
    to: input.email,
    resetUrl,
  });

  logger.info(
    {
      event: "audit.auth.password_reset.email_delivery.sent",
      userId: input.userId,
    },
    "Password reset email handed off to transport"
  );
}

export function queuePasswordResetEmail(input: PasswordResetEmailInput): void {
  void sendPasswordResetEmail(input).catch((error) => {
    logger.error(
      {
        event: "audit.auth.password_reset.email_delivery.failed",
        userId: input.userId,
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Password reset email delivery failed"
    );
  });
}
