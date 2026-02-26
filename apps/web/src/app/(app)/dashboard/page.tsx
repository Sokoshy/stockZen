import { redirect } from "next/navigation";

import { DashboardPageClient } from "~/features/dashboard/components/dashboard-page-client";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Dashboard - StockZen",
  description: "Overview of inventory alerts and key stats",
};

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/login");
  }

  return <DashboardPageClient />;
}
