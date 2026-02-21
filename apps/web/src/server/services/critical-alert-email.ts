import { env } from "~/lib/env";
import { logger } from "~/server/logger";

const EMAIL_TRANSPORT_TIMEOUT_MS = 5_000;
const EMAIL_TRANSPORT_MAX_ATTEMPTS = 2;
const EMAIL_TRANSPORT_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type CriticalAlertEmailRecipient = {
  email: string;
  userId: string;
};

export type CriticalAlertEmailPayload = {
  productName: string;
  productId: string;
  currentStock: number;
  alertLevel: "red";
  productUrl: string;
};

type CriticalAlertWebhookPayload = {
  template: "critical-alert";
  to: string;
  productName: string;
  productId: string;
  currentStock: number;
  alertLevel: "red";
  productUrl: string;
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
      `Critical alert email transport timed out after ${EMAIL_TRANSPORT_TIMEOUT_MS}ms`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Critical alert email transport failed");
}

async function postCriticalAlertWebhook(
  webhookUrl: string,
  payload: CriticalAlertWebhookPayload
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
          `Critical alert email transport returned ${response.status}`
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

  throw new Error("Critical alert email transport failed after retries");
}

export function buildProductUrl(productId: string): string {
  const productUrl = new URL(`/products/${productId}`, env.BETTER_AUTH_BASE_URL);
  return productUrl.toString();
}

export async function sendCriticalAlertEmail(
  recipient: CriticalAlertEmailRecipient,
  payload: CriticalAlertEmailPayload,
  webhookUrl?: string
): Promise<void> {
  const resolvedWebhookUrl = webhookUrl ?? env.CRITICAL_ALERT_EMAIL_WEBHOOK_URL;
  if (!resolvedWebhookUrl) {
    logger.info(
      {
        event: "alerts.critical.email_delivery.skipped",
        productId: payload.productId,
        userId: recipient.userId,
      },
      "Critical alert email transport is not configured"
    );
    return;
  }

  await postCriticalAlertWebhook(resolvedWebhookUrl, {
    template: "critical-alert",
    to: recipient.email,
    productName: payload.productName,
    productId: payload.productId,
    currentStock: payload.currentStock,
    alertLevel: "red",
    productUrl: payload.productUrl,
  });

  logger.info(
    {
      event: "alerts.critical.email_delivery.sent",
      productId: payload.productId,
      userId: recipient.userId,
    },
    "Critical alert email handed off to transport"
  );
}

export async function sendCriticalAlertEmailsToRecipients(
  recipients: CriticalAlertEmailRecipient[],
  payload: CriticalAlertEmailPayload
): Promise<void> {
  const webhookUrl = env.CRITICAL_ALERT_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.info(
      {
        event: "alerts.critical.email_delivery.batch_skipped",
        productId: payload.productId,
        recipientCount: recipients.length,
      },
      "Critical alert email transport is not configured"
    );
    return;
  }

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendCriticalAlertEmail(recipient, payload, webhookUrl)
    )
  );

  const failedCount = results.filter((r) => r.status === "rejected").length;
  const successCount = results.filter((r) => r.status === "fulfilled").length;

  if (failedCount > 0) {
    logger.warn(
      {
        event: "alerts.critical.email_delivery.partial_failure",
        productId: payload.productId,
        successCount,
        failedCount,
      },
      "Some critical alert emails failed to send"
    );
  } else {
    logger.info(
      {
        event: "alerts.critical.email_delivery.batch_sent",
        productId: payload.productId,
        recipientCount: successCount,
      },
      "All critical alert emails sent successfully"
    );
  }
}

export function queueCriticalAlertEmails(
  recipients: CriticalAlertEmailRecipient[],
  payload: CriticalAlertEmailPayload
): void {
  void sendCriticalAlertEmailsToRecipients(recipients, payload).catch((error) => {
    logger.error(
      {
        event: "alerts.critical.email_delivery.batch_failed",
        productId: payload.productId,
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Critical alert email batch delivery failed"
    );
  });
}
