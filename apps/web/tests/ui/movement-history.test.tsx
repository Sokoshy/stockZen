import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MovementHistory } from "~/features/inventory/components/movement-history";
import { useStockMovements } from "~/features/inventory/hooks/use-stock-movements";

vi.mock("~/features/inventory/hooks/use-stock-movements", () => ({
  useStockMovements: vi.fn(),
}));

type ObserverMock = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean) => void;
};

const observerInstances: ObserverMock[] = [];
const mockedUseStockMovements = vi.mocked(useStockMovements);

beforeEach(() => {
  observerInstances.length = 0;
  mockedUseStockMovements.mockReset();

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
});

describe("MovementHistory", () => {
  it("renders empty-state CTA to inventory with product preselection", () => {
    mockedUseStockMovements.mockReturnValue({
      movements: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      isEmpty: true,
    });

    render(<MovementHistory productId="product-1" tenantId="tenant-1" />);

    expect(screen.getByRole("link", { name: "Record Stock Movement" })).toHaveAttribute(
      "href",
      "/inventory?productId=product-1"
    );
  });

  it("triggers loadMore when sentinel intersects and more pages exist", () => {
    const loadMore = vi.fn();

    mockedUseStockMovements.mockReturnValue({
      movements: [
        {
          id: "movement-1",
          type: "entry",
          quantity: 5,
          createdAt: new Date().toISOString(),
          syncStatus: "synced",
          source: "server",
        },
      ],
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      loadMore,
      refresh: vi.fn(),
      isEmpty: false,
    });

    render(<MovementHistory productId="product-1" tenantId="tenant-1" />);

    observerInstances[0]?.trigger(true);

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it("does not trigger loadMore when already loading more", () => {
    const loadMore = vi.fn();

    mockedUseStockMovements.mockReturnValue({
      movements: [
        {
          id: "movement-1",
          type: "exit",
          quantity: 2,
          createdAt: new Date().toISOString(),
          syncStatus: "pending",
          source: "local",
        },
      ],
      isLoading: false,
      isLoadingMore: true,
      hasMore: true,
      loadMore,
      refresh: vi.fn(),
      isEmpty: false,
    });

    render(<MovementHistory productId="product-1" tenantId="tenant-1" />);

    observerInstances[0]?.trigger(true);

    expect(loadMore).not.toHaveBeenCalled();
  });
});
