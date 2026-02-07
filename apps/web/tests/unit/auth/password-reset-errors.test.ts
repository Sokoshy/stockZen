import { describe, expect, it } from "vitest";

import {
  extractErrorMessage,
  isInvalidResetTokenError,
} from "~/server/better-auth/password-reset-errors";

describe("extractErrorMessage", () => {
  it("reads nested body.message when present", () => {
    const message = extractErrorMessage({
      body: {
        message: "INVALID_TOKEN",
      },
    });

    expect(message).toBe("INVALID_TOKEN");
  });

  it("falls back to top-level message", () => {
    const message = extractErrorMessage({ message: "Some failure" });
    expect(message).toBe("Some failure");
  });

  it("returns unknown when no string message exists", () => {
    expect(extractErrorMessage({ body: { message: 123 } })).toBe("unknown");
    expect(extractErrorMessage(null)).toBe("unknown");
    expect(extractErrorMessage("oops")).toBe("unknown");
  });
});

describe("isInvalidResetTokenError", () => {
  it("detects invalid token variants", () => {
    expect(isInvalidResetTokenError({ body: { message: "INVALID_TOKEN" } })).toBe(true);
    expect(isInvalidResetTokenError({ message: "invalid token provided" })).toBe(true);
    expect(isInvalidResetTokenError({ body: { code: "TOKEN_EXPIRED" } })).toBe(true);
    expect(isInvalidResetTokenError({ code: "TOKEN_USED" })).toBe(true);
    expect(isInvalidResetTokenError({ message: "Token already used" })).toBe(true);
    expect(isInvalidResetTokenError({ body: { message: "verification not found" } })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isInvalidResetTokenError({ message: "database unavailable" })).toBe(false);
    expect(isInvalidResetTokenError({})).toBe(false);
  });
});
