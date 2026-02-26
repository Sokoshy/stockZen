import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlertsDashboardClient } from "~/features/alerts-dashboard/components/alerts-dashboard-client";
import { useAlertsDashboard } from "~/features/alerts-dashboard/queries/use-alerts-dashboard";

const invalidateDashboardQueryMock = vi.fn();
const invalidateListActiveMock = vi.fn();
const invalidateDashboardStatsMock = vi.fn();
const markHandledUseMutationMock = vi.fn();
const snoozeUseMutationMock = vi.fn();
const markHandledMutateMock = vi.fn();
const snoozeMutateMock = vi.fn();

type MutationCallbacks = {
  onSuccess?: () => void;
  onSettled?: () => void;
};

type ObserverMock = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean) => void;
};

const observerInstances: ObserverMock[] = [];

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("~/features/alerts-dashboard/queries/use-alerts-dashboard", () => ({
  useAlertsDashboard: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      alerts: {
        dashboard: {
          invalidate: invalidateDashboardQueryMock,
        },
        listActive: {
          invalidate: invalidateListActiveMock,
        },
      },
      dashboard: {
        stats: {
          invalidate: invalidateDashboardStatsMock,
        },
      },
    }),
    alerts: {
      markHandled: {
        useMutation: (callbacks?: MutationCallbacks) => markHandledUseMutationMock(callbacks),
      },
      snooze: {
        useMutation: (callbacks?: MutationCallbacks) => snoozeUseMutationMock(callbacks),
      },
    },
  },
}));

const mockedUseAlertsDashboard = vi.mocked(useAlertsDashboard);

beforeEach(() => {
  vi.clearAllMocks();
  observerInstances.length = 0;

  class MockIntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();

    constructor(private readonly callback: IntersectionObserverCallback) {
      observerInstances.push(this as unknown as ObserverMock);
    }

    trigger(isIntersecting: boolean) {
      this.callback(
        [
          {
            isIntersecting,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      );
    }
  }

  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  mockedUseAlertsDashboard.mockReturnValue({
    data: {
      pages: [
        {
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
          ],
          nextCursor: null,
        },
      ],
      pageParams: [],
    },
    isLoading: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  } as unknown as ReturnType<typeof useAlertsDashboard>);

  markHandledUseMutationMock.mockImplementation((callbacks?: MutationCallbacks) => ({
    mutate: (input: { alertId: string }) => {
      markHandledMutateMock(input);
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    },
  }));

  snoozeUseMutationMock.mockImplementation((callbacks?: MutationCallbacks) => ({
    mutate: (input: { alertId: string }) => {
      snoozeMutateMock(input);
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    },
  }));
});

describe("AlertsDashboardClient", () => {
  it("does not show empty state when query errors", () => {
    mockedUseAlertsDashboard.mockReturnValue({
      data: {
        pages: [],
        pageParams: [],
      },
      isLoading: false,
      error: new Error("network failure"),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useAlertsDashboard>);

    render(<AlertsDashboardClient />);

    expect(screen.getByText("Failed to load alerts")).toBeInTheDocument();
    expect(screen.queryByText("All Clear!")).not.toBeInTheDocument();
  });

  it("invalidates dashboard and alerts queries after mark handled", async () => {
    render(<AlertsDashboardClient />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Handled" }));

    expect(markHandledMutateMock).toHaveBeenCalledWith({ alertId: "alert-red" });

    await waitFor(() => {
      expect(invalidateDashboardQueryMock).toHaveBeenCalled();
      expect(invalidateListActiveMock).toHaveBeenCalled();
      expect(invalidateDashboardStatsMock).toHaveBeenCalled();
    });
  });

  it("loads next page when sentinel intersects", () => {
    const fetchNextPage = vi.fn();

    mockedUseAlertsDashboard.mockReturnValue({
      data: {
        pages: [
          {
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
            ],
            nextCursor: "cursor-2",
          },
        ],
        pageParams: [],
      },
      isLoading: false,
      error: null,
      hasNextPage: true,
      fetchNextPage,
      isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useAlertsDashboard>);

    render(<AlertsDashboardClient />);

    observerInstances[0]?.trigger(true);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
