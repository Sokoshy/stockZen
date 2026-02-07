import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("~/server/better-auth/server", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("~/features/auth/components/forgot-password-form", () => ({
  ForgotPasswordForm: () => <div data-testid="forgot-password-form" />, 
}));

import ForgotPasswordPage from "~/app/(auth)/forgot-password/page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("renders forgot password form for guests", async () => {
    getSessionMock.mockResolvedValue(null);

    render(await ForgotPasswordPage());

    expect(screen.getByTestId("forgot-password-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("redirects authenticated users to dashboard", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await ForgotPasswordPage();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
