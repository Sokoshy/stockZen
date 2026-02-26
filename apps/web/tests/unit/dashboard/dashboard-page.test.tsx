import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getCurrentTenantMembershipMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("~/server/better-auth/server", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("~/trpc/server", () => ({
  api: {
    auth: {
      getCurrentTenantMembership: () => getCurrentTenantMembershipMock(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("~/features/dashboard/components/dashboard-page-client", () => ({
  DashboardPageClient: () => <div data-testid="dashboard-page-client" />,
}));

import DashboardPage from "~/app/(app)/dashboard/page";

describe("DashboardPage", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getCurrentTenantMembershipMock.mockReset();
    redirectMock.mockReset();
  });

  it("redirects unauthenticated users to login", async () => {
    getSessionMock.mockResolvedValue(null);

    await DashboardPage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects users without membership to login", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getCurrentTenantMembershipMock.mockResolvedValue(null);

    await DashboardPage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders dashboard client for authenticated tenant members", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getCurrentTenantMembershipMock.mockResolvedValue({
      tenantId: "tenant-1",
      role: "Admin",
    });

    render(await DashboardPage());

    expect(screen.getByTestId("dashboard-page-client")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
