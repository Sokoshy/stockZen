import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProductUrl,
  sendCriticalAlertEmail,
  sendCriticalAlertEmailsToRecipients,
  queueCriticalAlertEmails,
  type CriticalAlertEmailRecipient,
  type CriticalAlertEmailPayload,
} from "~/server/services/critical-alert-email";

describe("critical alert email utility", () => {
  const defaultRecipient: CriticalAlertEmailRecipient = {
    email: "user@example.com",
    userId: "user-1",
  };

  const defaultPayload: CriticalAlertEmailPayload = {
    productName: "Test Product",
    productId: "product-1",
    currentStock: 5,
    alertLevel: "red",
    productUrl: "http://localhost:3000/products/product-1",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildProductUrl", () => {
    it("builds product URL from trusted base URL", () => {
      const productUrl = buildProductUrl("product-123");
      const parsed = new URL(productUrl);

      expect(parsed.origin).toBe("http://localhost:3000");
      expect(parsed.pathname).toBe("/products/product-123");
    });
  });

  describe("sendCriticalAlertEmail", () => {
    it("skips transport call when no webhook is provided", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await sendCriticalAlertEmail(defaultRecipient, defaultPayload);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends webhook payload with correct structure when configured", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, {
          status: 202,
        })
      );

      await sendCriticalAlertEmail(
        defaultRecipient,
        defaultPayload,
        "https://example.com/webhooks/critical-alert"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0] ?? [];
      expect(url).toBe("https://example.com/webhooks/critical-alert");
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });

      const parsedBody = JSON.parse((init as RequestInit).body as string) as {
        template: string;
        to: string;
        productName: string;
        productId: string;
        currentStock: number;
        alertLevel: string;
        productUrl: string;
      };

      expect(parsedBody.template).toBe("critical-alert");
      expect(parsedBody.to).toBe("user@example.com");
      expect(parsedBody.productName).toBe("Test Product");
      expect(parsedBody.productId).toBe("product-1");
      expect(parsedBody.currentStock).toBe(5);
      expect(parsedBody.alertLevel).toBe("red");
      expect(parsedBody.productUrl).toBe("http://localhost:3000/products/product-1");
    });

    it("throws when webhook transport returns non-2xx", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, {
          status: 500,
        })
      );

      await expect(
        sendCriticalAlertEmail(
          defaultRecipient,
          defaultPayload,
          "https://example.com/webhooks/critical-alert"
        )
      ).rejects.toThrow(/transport returned 500/i);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("times out and retries once on abort errors", async () => {
      const abortError = Object.assign(new Error("aborted"), {
        name: "AbortError",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

      await expect(
        sendCriticalAlertEmail(
          defaultRecipient,
          defaultPayload,
          "https://example.com/webhooks/critical-alert"
        )
      ).rejects.toThrow(/timed out/i);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries on retryable status codes", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, { status: 429 }))
        .mockResolvedValueOnce(new Response(null, { status: 202 }));

      await sendCriticalAlertEmail(
        defaultRecipient,
        defaultPayload,
        "https://example.com/webhooks/critical-alert"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries on 503 status", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 202 }));

      await sendCriticalAlertEmail(
        defaultRecipient,
        defaultPayload,
        "https://example.com/webhooks/critical-alert"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("does not retry on non-retryable status codes", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 400 })
      );

      await expect(
        sendCriticalAlertEmail(
          defaultRecipient,
          defaultPayload,
          "https://example.com/webhooks/critical-alert"
        )
      ).rejects.toThrow(/transport returned 400/i);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("queueCriticalAlertEmails", () => {
    it("queues async delivery without blocking caller", () => {
      const recipients: CriticalAlertEmailRecipient[] = [
        { email: "user1@example.com", userId: "user-1" },
      ];

      const result = queueCriticalAlertEmails(recipients, defaultPayload);

      expect(result).toBeUndefined();
    });
  });

  describe("sendCriticalAlertEmailsToRecipients", () => {
    it("sends one request per recipient and returns delivery summary", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, {
          status: 202,
        })
      );

      const recipients: CriticalAlertEmailRecipient[] = [
        { email: "user1@example.com", userId: "user-1" },
        { email: "user2@example.com", userId: "user-2" },
      ];

      const result = await sendCriticalAlertEmailsToRecipients(
        recipients,
        defaultPayload,
        "https://example.com/webhooks/critical-alert"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.configured).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.failedDeliveries).toHaveLength(0);
    });

    it("returns failed recipient details when one delivery fails", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, { status: 202 }))
        .mockResolvedValueOnce(new Response(null, { status: 400 }));

      const recipients: CriticalAlertEmailRecipient[] = [
        { email: "user1@example.com", userId: "user-1" },
        { email: "user2@example.com", userId: "user-2" },
      ];

      const result = await sendCriticalAlertEmailsToRecipients(
        recipients,
        defaultPayload,
        "https://example.com/webhooks/critical-alert"
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.configured).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failedDeliveries).toHaveLength(1);
      expect(result.failedDeliveries[0]).toMatchObject({
        userId: "user-2",
      });
      expect(result.failedDeliveries[0]?.reason).toMatch(/transport returned 400/i);
    });

    it("returns misconfigured summary when webhook is missing", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await sendCriticalAlertEmailsToRecipients(
        [defaultRecipient],
        defaultPayload,
        ""
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.configured).toBe(false);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.failedDeliveries).toHaveLength(0);
    });
  });
});
