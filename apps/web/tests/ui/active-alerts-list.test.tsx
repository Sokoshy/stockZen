import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveAlertsList } from "~/features/alerts/components/active-alerts-list";

const invalidateMock = vi.fn();
const invalidateDashboardStatsMock = vi.fn();
const listActiveUseQueryMock = vi.fn();
const markHandledUseMutationMock = vi.fn();
const snoozeUseMutationMock = vi.fn();
const markHandledMutateMock = vi.fn();
const snoozeMutateMock = vi.fn();

type MutationCallbacks = {
  onSuccess?: () => void;
  onSettled?: () => void;
};

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      alerts: {
        listActive: {
          invalidate: invalidateMock,
        },
      },
      dashboard: {
        stats: {
          invalidate: invalidateDashboardStatsMock,
        },
      },
    }),
    alerts: {
      listActive: {
        useQuery: (...args: unknown[]) => listActiveUseQueryMock(...args),
      },
      markHandled: {
        useMutation: (callbacks?: MutationCallbacks) =>
          markHandledUseMutationMock(callbacks),
      },
      snooze: {
        useMutation: (callbacks?: MutationCallbacks) => snoozeUseMutationMock(callbacks),
      },
    },
  },
}));

describe("ActiveAlertsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listActiveUseQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        alerts: [
          {
            id: "alert-red",
            productId: "product-1",
            productName: "Flour",
            level: "red",
            currentStock: 12,
            snoozedUntil: null,
            createdAt: "2026-02-20T09:00:00.000Z",
            updatedAt: "2026-02-20T09:00:00.000Z",
          },
          {
            id: "alert-orange",
            productId: "product-2",
            productName: "Butter",
            level: "orange",
            currentStock: 45,
            snoozedUntil: null,
            createdAt: "2026-02-20T09:00:00.000Z",
            updatedAt: "2026-02-20T09:00:00.000Z",
          },
        ],
      },
    });

    markHandledUseMutationMock.mockImplementation((callbacks?: MutationCallbacks) => ({
      isPending: false,
      mutate: (input: { alertId: string }) => {
        markHandledMutateMock(input);
        callbacks?.onSuccess?.();
        callbacks?.onSettled?.();
      },
    }));

    snoozeUseMutationMock.mockImplementation((callbacks?: MutationCallbacks) => ({
      isPending: false,
      mutate: (input: { alertId: string }) => {
        snoozeMutateMock(input);
        callbacks?.onSuccess?.();
        callbacks?.onSettled?.();
      },
    }));
  });

  it("renders active alerts with triage actions", () => {
    render(<ActiveAlertsList />);

    expect(screen.getByText("Active Alerts")).toBeInTheDocument();
    expect(screen.getByText("Flour")).toBeInTheDocument();
    expect(screen.getByText("Butter")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark Handled" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Snooze 8h" })).toHaveLength(2);
  });

  it("invalidates list and notifies parent after mark handled", async () => {
    const onAlertHandled = vi.fn();

    render(<ActiveAlertsList onAlertHandled={onAlertHandled} />);

    const handleButtons = screen.getAllByRole("button", { name: "Mark Handled" });
    fireEvent.click(handleButtons[0]!);

    expect(markHandledMutateMock).toHaveBeenCalledWith({ alertId: "alert-red" });

    await waitFor(() => {
      expect(invalidateMock).toHaveBeenCalled();
      expect(invalidateDashboardStatsMock).toHaveBeenCalled();
      expect(onAlertHandled).toHaveBeenCalled();
    });
  });

  it("invalidates list and notifies parent after snooze", async () => {
    const onAlertHandled = vi.fn();

    render(<ActiveAlertsList onAlertHandled={onAlertHandled} />);

    const snoozeButtons = screen.getAllByRole("button", { name: "Snooze 8h" });
    fireEvent.click(snoozeButtons[1]!);

    expect(snoozeMutateMock).toHaveBeenCalledWith({ alertId: "alert-orange" });

    await waitFor(() => {
      expect(invalidateMock).toHaveBeenCalled();
      expect(invalidateDashboardStatsMock).toHaveBeenCalled();
      expect(onAlertHandled).toHaveBeenCalled();
    });
  });
});
