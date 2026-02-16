import { redirect } from "next/navigation";

import { EditProductForm } from "~/features/products/components/edit-product-form";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { canWritePurchasePrice as canWritePurchasePriceUtil } from "~/server/auth/rbac-policy";
import type { Product } from "~/schemas/products";

export const metadata = {
  title: "Edit Product - StockZen",
  description: "Edit an existing product with offline-first support",
};

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  const canWritePurchasePrice = canWritePurchasePriceUtil(membership.role);

  let product: Product;
  try {
    product = (await api.products.getById({ id })) as Product;
  } catch {
    redirect("/products");
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit Product</h1>
          <p className="mt-1 text-sm text-gray-600">
            Edit product details. You can save offline for later sync.
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <EditProductForm
            product={{
              id: product.id,
              name: product.name,
              description: product.description,
              sku: product.sku,
              category: product.category,
              unit: product.unit,
              barcode: product.barcode,
              price: product.price,
              purchasePrice: product.purchasePrice,
              lowStockThreshold: product.lowStockThreshold,
            }}
            tenantId={membership.tenantId}
            canWritePurchasePrice={canWritePurchasePrice}
          />
        </div>
      </div>
    </div>
  );
}
