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

vi.mock("~/features/auth/components/login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />, 
}));

import LoginPage from "~/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("renders login content and forgot-password link for guests", async () => {
    getSessionMock.mockResolvedValue(null);

    render(await LoginPage());

    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /forgot password\?/i })).toHaveAttribute(
      "href",
      "/forgot-password"
    );
  });

  it("redirects authenticated users to dashboard", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });

    await LoginPage();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
