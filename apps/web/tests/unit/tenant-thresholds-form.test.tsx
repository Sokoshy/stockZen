import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantThresholdsForm } from "~/features/tenant-thresholds/components/tenant-thresholds-form";

const invalidateMock = vi.fn();
const useQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      tenantThresholds: {
        getTenantDefaultThresholds: {
          invalidate: invalidateMock,
        },
      },
    }),
    tenantThresholds: {
      getTenantDefaultThresholds: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
      updateTenantDefaultThresholds: {
        useMutation: (...args: unknown[]) => useMutationMock(...args),
      },
    },
  },
}));

describe("TenantThresholdsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useQueryMock.mockReturnValue({
      data: {
        criticalThreshold: 50,
        attentionThreshold: 100,
      },
      isLoading: false,
    });

    useMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  it("renders a loading state while thresholds are fetched", () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<TenantThresholdsForm />);

    expect(screen.getByText("Loading current threshold values...")).toBeInTheDocument();
  });

  it("shows read-only values and no submit controls for non-admin users", () => {
    render(<TenantThresholdsForm disabled />);

    expect(screen.getByText("Critical threshold")).toBeInTheDocument();
    expect(screen.getByText("Attention threshold")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
  });

  it("submits valid values for admin users", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync,
    });

    render(<TenantThresholdsForm />);

    const criticalInput = screen.getByLabelText("Critical threshold");
    const attentionInput = screen.getByLabelText("Attention threshold");

    fireEvent.change(criticalInput, { target: { value: "40" } });
    fireEvent.change(attentionInput, { target: { value: "90" } });
    const submitButton = screen.getByRole("button", { name: /save changes/i });
    const formElement = submitButton.closest("form");
    if (!formElement) {
      throw new Error("Expected threshold form element");
    }

    fireEvent.submit(formElement);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        criticalThreshold: 40,
        attentionThreshold: 90,
      });
    });
  });
});
