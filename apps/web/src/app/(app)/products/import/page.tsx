import { redirect } from "next/navigation";

import { CSVImportClient } from "~/features/products/components/CSVImportClient";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Import Products - StockZen",
  description: "Bulk import products via CSV file with validation and error reporting",
};

export default async function ImportProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  const allowedRoles = ["Admin", "Manager"] as const;
  const roleCheck = membership.role as typeof allowedRoles[number];
  if (!allowedRoles.includes(roleCheck)) {
    redirect("/dashboard");
  }

  const membershipWithUserId = {
    tenantId: membership.tenantId,
    role: membership.role,
    userId: session.user.id,
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Import Products</h1>
            <p className="mt-1 text-sm text-gray-600">
              Bulk import products from a CSV file. Upload a CSV file with columns: name, category, unit, price, and optional barcode.
            </p>
          </div>
          <a
            href="/products"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
          >
            Back to Products
          </a>
        </div>

        <CSVImportClient
          allowedRoles={allowedRoles}
          membership={membershipWithUserId}
        />
      </div>
    </div>
  );
}
