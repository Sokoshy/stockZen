import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductsTable } from "~/features/products/components/products-table";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Products - StockZen",
  description: "Browse tenant products with role-aware pricing fields",
};

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  const data = await api.products.list();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Products</h1>
            <p className="mt-1 text-sm text-gray-600">
              Role-aware product list with secure purchase price visibility.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/products/create"
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Create Product
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <ProductsTable
          products={data.products}
          actorRole={data.actorRole}
          tenantId={membership.tenantId}
        />
      </div>
    </div>
  );
}
