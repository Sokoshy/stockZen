"use client";

import Link from "next/link";

import type { TenantRole } from "~/schemas/team-membership";
import { DeleteProductDialog } from "./delete-product-dialog";
import type { ProductRow } from "../utils/filter-utils";

type ProductsTableProps = {
  products: ProductRow[];
  actorRole: TenantRole;
  tenantId: string;
  onProductDeleted: (productId: string) => void;
  onProductRestored: (productId: string) => void;
};

export function ProductsTable({
  products,
  actorRole,
  tenantId,
  onProductDeleted,
  onProductRestored,
}: ProductsTableProps) {
  const canViewPurchasePrice = actorRole === "Admin" || actorRole === "Manager";

  const getSyncBadgeClasses = (status: ProductRow["syncStatus"]) => {
    if (status === "pending") {
      return "bg-amber-100 text-amber-800";
    }
    if (status === "failed") {
      return "bg-red-100 text-red-700";
    }

    return "bg-green-100 text-green-700";
  };

  return (
    <div className="space-y-4">
      {!canViewPurchasePrice ? (
        <div className="rounded-md bg-blue-50 p-4" role="status">
          <p className="text-sm font-medium text-blue-900">
            Purchase prices are hidden for your role.
          </p>
        </div>
      ) : null}

      {products.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6">
          <p className="text-sm text-gray-600">No products found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Unit
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  SKU
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Barcode
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sale Price
                </th>
                {canViewPurchasePrice ? (
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Purchase Price
                  </th>
                ) : null}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Quantity
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Updated
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sync
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.category ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.unit ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.sku ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.barcode ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.price}</td>
                  {canViewPurchasePrice ? (
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {"purchasePrice" in product ? (product.purchasePrice ?? "-") : "-"}
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-sm text-gray-700">{product.quantity}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {new Date(product.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSyncBadgeClasses(product.syncStatus)}`}
                    >
                      {product.syncStatus}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${product.id}/edit`}
                        className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Edit
                      </Link>
                      <DeleteProductDialog
                        product={{
                          id: product.id,
                          name: product.name,
                          syncStatus: product.syncStatus,
                        }}
                        tenantId={tenantId}
                        onDeleted={() => {
                          onProductDeleted(product.id);
                        }}
                        onRestored={() => {
                          onProductRestored(product.id);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
