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

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create Product</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create a new product. You can save offline for later sync.
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <CreateProductForm
            tenantId={membership.tenantId}
            canWritePurchasePrice={canWritePurchasePrice}
          />
        </div>
      </div>
    </div>
  );
}
