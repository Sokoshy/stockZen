import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPasswordResetUseMutationMock = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    auth: {
      requestPasswordReset: {
        useMutation: (options: unknown) => requestPasswordResetUseMutationMock(options),
      },
    },
  },
}));

import { ForgotPasswordForm } from "~/features/auth/components/forgot-password-form";

const GENERIC_MESSAGE =
  "If this email exists in our system, check your email for the reset link";

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    requestPasswordResetUseMutationMock.mockReset();
  });

  it("submits email and shows generic success message", async () => {
    const calls: unknown[] = [];

    requestPasswordResetUseMutationMock.mockImplementation((options?: { onSuccess?: (data: { success: boolean; message: string }) => void }) => ({
      isPending: false,
      mutateAsync: async (input: unknown) => {
        calls.push(input);
        const data = { success: true, message: GENERIC_MESSAGE };
        options?.onSuccess?.(data);
        return data;
      },
    }));

    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(calls).toEqual([{ email: "user@example.com" }]);
    });

    expect(screen.getByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });

  it("shows field-level validation for invalid email", async () => {
    requestPasswordResetUseMutationMock.mockImplementation(() => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }));

    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "invalid-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });
  });
});
