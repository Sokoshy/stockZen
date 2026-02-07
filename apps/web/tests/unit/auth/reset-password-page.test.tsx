import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const redirectMock = vi.fn();
const resetPasswordFormPropsMock = vi.fn();

vi.mock("~/server/better-auth/server", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("~/features/auth/components/reset-password-form", () => ({
  ResetPasswordForm: (props: { token: string; initialError?: string }) => {
    resetPasswordFormPropsMock(props);
    return <div data-testid="reset-password-form" />;
  },
}));

import ResetPasswordPage from "~/app/(auth)/reset-password/page";

const INVALID_TOKEN_MESSAGE =
  "This reset link is invalid or has expired. Please request a new reset link.";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockReset();
    resetPasswordFormPropsMock.mockReset();
  });

  it("passes default invalid-token error when token is missing", async () => {
    getSessionMock.mockResolvedValue(null);

    render(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("reset-password-form")).toBeInTheDocument();
    expect(resetPasswordFormPropsMock).toHaveBeenCalled();

    const props = resetPasswordFormPropsMock.mock.calls.at(0)?.[0] as
      | { token: string; initialError?: string }
      | undefined;

    expect(props?.token).toBe("");
    expect(props?.initialError).toBe(INVALID_TOKEN_MESSAGE);
  });

  it("passes token and no initial error for valid reset link", async () => {
    getSessionMock.mockResolvedValue(null);

    render(
      await ResetPasswordPage({
        searchParams: Promise.resolve({ token: "valid-token" }),
      })
    );

    const props = resetPasswordFormPropsMock.mock.calls.at(0)?.[0] as
      | { token: string; initialError?: string }
      | undefined;

    expect(props?.token).toBe("valid-token");
    expect(props?.initialError).toBeUndefined();
    expect(screen.getByRole("link", { name: /request password reset/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });

  it("passes generic token error when query contains error", async () => {
    getSessionMock.mockResolvedValue(null);

    render(
      await ResetPasswordPage({
        searchParams: Promise.resolve({
          token: "valid-token",
          error: "INVALID_TOKEN",
        }),
      })
    );

    const props = resetPasswordFormPropsMock.mock.calls.at(0)?.[0] as
      | { token: string; initialError?: string }
      | undefined;

    expect(props?.token).toBe("valid-token");
    expect(props?.initialError).toBe(INVALID_TOKEN_MESSAGE);
  });

  it("redirects authenticated users to dashboard", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await ResetPasswordPage({ searchParams: Promise.resolve({ token: "valid-token" }) });

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
