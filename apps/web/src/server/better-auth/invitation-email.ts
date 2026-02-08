import { env } from "~/lib/env";
import { logger } from "~/server/logger";

const INVITATION_PATH = "/invite";
const EMAIL_TRANSPORT_TIMEOUT_MS = 5_000;
const EMAIL_TRANSPORT_MAX_ATTEMPTS = 2;
const EMAIL_TRANSPORT_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

type InvitationEmailInput = {
  invitationId: string;
  email: string;
  token: string;
  tenantName: string;
  invitedByName: string;
  role: string;
  webhookUrl?: string;
};

type InvitationWebhookPayload = {
  template: "tenant-invitation";
  to: string;
  inviteUrl: string;
  tenantName: string;
  invitedByName: string;
  role: string;
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
      `Invitation email transport timed out after ${EMAIL_TRANSPORT_TIMEOUT_MS}ms`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Invitation email transport failed");
}

async function postInvitationWebhook(
  webhookUrl: string,
  payload: InvitationWebhookPayload
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
          `Invitation email transport returned ${response.status}`
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

  throw new Error("Invitation email transport failed after retries");
}

export function getTrustedInvitationRedirectUrl(): string {
  return new URL(INVITATION_PATH, env.BETTER_AUTH_BASE_URL).toString();
}

export function buildTrustedInvitationUrl(token: string): string {
  const inviteUrl = new URL(INVITATION_PATH, env.BETTER_AUTH_BASE_URL);
  inviteUrl.searchParams.set("token", token);
  return inviteUrl.toString();
}

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
  const webhookUrl = input.webhookUrl ?? env.INVITATION_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.info(
      {
        event: "audit.auth.invitation.email_delivery.skipped",
        invitationId: input.invitationId,
      },
      "Invitation email transport is not configured"
    );
    return;
  }

  const inviteUrl = buildTrustedInvitationUrl(input.token);

  await postInvitationWebhook(webhookUrl, {
    template: "tenant-invitation",
    to: input.email,
    inviteUrl,
    tenantName: input.tenantName,
    invitedByName: input.invitedByName,
    role: input.role,
  });

  logger.info(
    {
      event: "audit.auth.invitation.email_delivery.sent",
      invitationId: input.invitationId,
      targetEmail: input.email,
    },
    "Invitation email handed off to transport"
  );
}

export function queueInvitationEmail(input: InvitationEmailInput): void {
  void sendInvitationEmail(input).catch((error) => {
    logger.error(
      {
        event: "audit.auth.invitation.email_delivery.failed",
        invitationId: input.invitationId,
        targetEmail: input.email,
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Invitation email delivery failed"
    );
  });
}
