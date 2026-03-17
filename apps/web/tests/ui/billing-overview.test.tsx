import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingOverview } from "~/features/billing/components/billing-overview";
import { useSubscription } from "~/features/billing/queries/useSubscription";
import { useUsage } from "~/features/billing/queries/useUsage";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("~/features/billing/queries/useSubscription", () => ({
  useSubscription: vi.fn(),
}));

vi.mock("~/features/billing/queries/useUsage", () => ({
  useUsage: vi.fn(),
}));

const mockedUseSubscription = vi.mocked(useSubscription);
const mockedUseUsage = vi.mocked(useUsage);
let storage = new Map<string, string>();

describe("BillingOverview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        clear: () => {
          storage.clear();
        },
      },
      configurable: true,
    });
    window.localStorage.clear();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);

    mockedUseSubscription.mockReturnValue({
      data: {
        plan: "Free",
        limits: { maxProducts: 20, maxUsers: 1 },
        source: "default",
      },
      error: null,
    } as ReturnType<typeof useSubscription>);

    mockedUseUsage.mockReturnValue({
      data: {
        productCount: 12,
        userCount: 1,
      },
      error: null,
    } as ReturnType<typeof useUsage>);
  });

  it("shows plan limits and usage details for Admins", () => {
    render(<BillingOverview actorRole="Admin" tenantId="tenant-1" />);

    expect(screen.getByText("Billing & Subscription")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("12/20")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change plan (coming soon)" })).toBeInTheDocument();
  });

  it("hides the change plan CTA for non-admin roles", () => {
    render(<BillingOverview actorRole="Manager" tenantId="tenant-1" />);

    expect(screen.queryByRole("button", { name: "Change plan (coming soon)" })).not.toBeInTheDocument();
    expect(screen.getByText("Role: Manager")).toBeInTheDocument();
  });

  it("keeps usage indicators readable when usage exceeds the limit", () => {
    mockedUseUsage.mockReturnValue({
      data: {
        productCount: 24,
        userCount: 2,
      },
      error: null,
    } as ReturnType<typeof useUsage>);

    render(<BillingOverview actorRole="Admin" tenantId="tenant-1" />);

    expect(screen.getAllByText("Usage exceeds the current plan limit.")).toHaveLength(2);
    expect(screen.getByText("24/20")).toBeInTheDocument();
    expect(screen.getByText("2/1")).toBeInTheDocument();
  });

  it("shows cached billing data when offline and live queries are unavailable", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    window.localStorage.setItem(
      "stockzen:billing:tenant-1",
      JSON.stringify({
        subscription: {
          plan: "Pro",
          limits: { maxProducts: 150, maxUsers: 3 },
          source: "tenant",
        },
        usage: {
          productCount: 90,
          userCount: 3,
        },
      })
    );

    mockedUseSubscription.mockReturnValue({
      data: undefined,
      error: new Error("offline"),
    } as unknown as ReturnType<typeof useSubscription>);

    mockedUseUsage.mockReturnValue({
      data: undefined,
      error: new Error("offline"),
    } as unknown as ReturnType<typeof useUsage>);

    render(<BillingOverview actorRole="Operator" tenantId="tenant-1" />);

    expect(
      await screen.findByText(
        "You are offline. Showing the most recently cached subscription data in read-only mode."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("90/150")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });
});
