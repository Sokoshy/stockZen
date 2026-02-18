import { redirect } from "next/navigation";
import Link from "next/link";

import { MovementHistory } from "~/features/inventory/components/movement-history";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export const metadata = {
  title: "Movement History - StockZen",
  description: "View stock movement history for a product",
};

interface MovementsPageProps {
  params: Promise<{ id: string }>;
}

export default async function MovementsPage({ params }: MovementsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const membership = await api.auth.getCurrentTenantMembership();

  if (!membership) {
    redirect("/dashboard");
  }

  let productName: string | undefined;
  try {
    const product = await api.products.getById({ id });
    productName = product.name;
  } catch {
    redirect("/products");
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Link
                href="/products"
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
              >
                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Products
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Movement History</h1>
            <p className="mt-1 text-sm text-gray-600">
              View stock movements for this product, including offline entries.
            </p>
          </div>

          <Link
            href={`/products/${id}/edit`}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Product
          </Link>
        </div>

        <MovementHistory
          productId={id}
          tenantId={membership.tenantId}
          productName={productName}
        />
      </div>
    </div>
  );
}
