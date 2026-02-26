import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateProductForm } from "~/features/products/components/create-product-form";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { canWritePurchasePrice as canWritePurchasePriceUtil } from "~/server/auth/rbac-policy";

export const metadata = {
  title: "Create Product - StockZen",
  description: "Create a new product with offline-first support",
};

export default async function CreateProductPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  const canWritePurchasePrice = canWritePurchasePriceUtil(membership.role);
  const suggestions = await api.products.suggestions();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create Product</h1>
              <p className="mt-1 text-sm text-gray-600">
                Create a new product. You can save offline for later sync.
              </p>
            </div>

            <Link
              href="/products"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
            >
              Back to products
            </Link>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <CreateProductForm
            tenantId={membership.tenantId}
            canWritePurchasePrice={canWritePurchasePrice}
            existingCategories={suggestions.categories}
            existingUnits={suggestions.units}
          />
        </div>
      </div>
    </div>
  );
}
