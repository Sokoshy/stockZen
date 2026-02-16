import Link from "next/link";
import { redirect } from "next/navigation";

import { StockMovementForm } from "~/features/inventory/components/stock-movement-form";
import { SyncStatusSummary } from "~/features/products/components/sync-status-summary";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Inventory - StockZen",
  description: "Record stock movements",
};

export default async function InventoryPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Record Stock Movement</h1>
            <p className="text-gray-600">
              Record stock entries and exits quickly. Works offline and syncs automatically.
            </p>
          </div>

          <Link
            href="/products"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
          >
            Back to products
          </Link>
        </div>

        <div className="mb-4">
          <SyncStatusSummary tenantId={membership.tenantId} />
        </div>

        <StockMovementForm tenantId={membership.tenantId} />
      </div>
    </div>
  );
}
