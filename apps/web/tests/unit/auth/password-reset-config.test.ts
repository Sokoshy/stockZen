// @vitest-environment node

import { describe, expect, it } from "vitest";

import { auth } from "~/server/better-auth";

describe("Better Auth password reset configuration", () => {
  it("enables reset hooks, short token TTL, and session revocation", () => {
    const emailAndPassword = auth.options.emailAndPassword;

    expect(typeof emailAndPassword?.sendResetPassword).toBe("function");
    expect(typeof emailAndPassword?.onPasswordReset).toBe("function");
    expect(emailAndPassword?.resetPasswordTokenExpiresIn).toBe(900);
    expect(emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });
});
