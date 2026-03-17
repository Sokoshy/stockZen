import { redirect } from "next/navigation";

import { BillingOverview } from "~/features/billing/components/billing-overview";
import { getSession } from "~/server/better-auth/server";
import { api, HydrateClient } from "~/trpc/server";

export const metadata = {
  title: "Billing - StockZen",
  description: "View your current subscription plan, limits, and tenant usage.",
};

export default async function BillingPage() {
  const session = await getSession();

  if (!session) {
    return redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    return redirect("/login");
  }

  await Promise.all([api.billing.current.prefetch(), api.billing.usage.prefetch()]);

  return (
    <HydrateClient>
      <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <BillingOverview actorRole={membership.role} tenantId={membership.tenantId} />
        </div>
      </div>
    </HydrateClient>
  );
}
