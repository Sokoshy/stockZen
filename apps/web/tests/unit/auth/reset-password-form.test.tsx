import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordUseMutationMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    auth: {
      resetPassword: {
        useMutation: (options: unknown) => resetPasswordUseMutationMock(options),
      },
    },
  },
}));

import { ResetPasswordForm } from "~/features/auth/components/reset-password-form";

const RESET_SUCCESS_MESSAGE =
  "Password reset successful. Please sign in with your new password.";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    resetPasswordUseMutationMock.mockReset();
    replaceMock.mockReset();
  });

  it("submits token + new password and shows success message", async () => {
    const calls: unknown[] = [];

    resetPasswordUseMutationMock.mockImplementation((options?: { onSuccess?: (data: { success: boolean; message: string }) => void }) => ({
      isPending: false,
      mutateAsync: async (input: unknown) => {
        calls.push(input);
        const data = { success: true, message: RESET_SUCCESS_MESSAGE };
        options?.onSuccess?.(data);
        return data;
      },
    }));

    render(<ResetPasswordForm token="valid-token" />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "NewPassword123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "NewPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(calls).toEqual([{ token: "valid-token", newPassword: "NewPassword123" }]);
    });

    expect(screen.getByText(RESET_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("shows field-level validation when passwords do not match", async () => {
    resetPasswordUseMutationMock.mockImplementation(() => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }));

    render(<ResetPasswordForm token="valid-token" />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "NewPassword123" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "DifferentPassword123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("disables submit when token is missing", () => {
    resetPasswordUseMutationMock.mockImplementation(() => ({
      isPending: false,
      mutateAsync: vi.fn(),
    }));

    render(
      <ResetPasswordForm
        token=""
        initialError="This reset link is invalid or has expired. Please request a new reset link."
      />
    );

    expect(screen.getByRole("button", { name: /reset password/i })).toBeDisabled();
    expect(
      screen.getByText(/this reset link is invalid or has expired\. please request a new reset link\./i)
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
