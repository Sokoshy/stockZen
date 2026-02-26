import { redirect } from "next/navigation";

import { AlertsDashboardClient } from "~/features/alerts-dashboard/components/alerts-dashboard-client";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Alerts - StockZen",
  description: "View and manage all active stock alerts",
};

export default async function AlertsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/login");
  }

  return <AlertsDashboardClient />;
}
