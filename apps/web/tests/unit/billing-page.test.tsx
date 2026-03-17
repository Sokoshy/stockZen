import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getCurrentTenantMembershipMock = vi.fn();
const prefetchCurrentMock = vi.fn();
const prefetchUsageMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("~/server/better-auth/server", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("~/trpc/server", () => ({
  api: {
    auth: {
      getCurrentTenantMembership: () => getCurrentTenantMembershipMock(),
    },
    billing: {
      current: {
        prefetch: () => prefetchCurrentMock(),
      },
      usage: {
        prefetch: () => prefetchUsageMock(),
      },
    },
  },
  HydrateClient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("~/features/billing/components/billing-overview", () => ({
  BillingOverview: ({ actorRole, tenantId }: { actorRole: string; tenantId: string }) => (
    <div data-testid="billing-overview">{actorRole}:{tenantId}</div>
  ),
}));

import BillingPage from "~/app/(app)/settings/billing/page";

describe("BillingPage", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getCurrentTenantMembershipMock.mockReset();
    prefetchCurrentMock.mockReset();
    prefetchUsageMock.mockReset();
    redirectMock.mockReset();
  });

  it("redirects unauthenticated users to login", async () => {
    getSessionMock.mockResolvedValue(null);

    await BillingPage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects users without a tenant membership to login", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getCurrentTenantMembershipMock.mockResolvedValue(null);

    await BillingPage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders the billing overview for authenticated tenant members", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getCurrentTenantMembershipMock.mockResolvedValue({
      tenantId: "tenant-1",
      role: "Admin",
    });

    render(await BillingPage());

    expect(screen.getByTestId("billing-overview")).toHaveTextContent("Admin:tenant-1");
    expect(prefetchCurrentMock).toHaveBeenCalled();
    expect(prefetchUsageMock).toHaveBeenCalled();
  });
});
