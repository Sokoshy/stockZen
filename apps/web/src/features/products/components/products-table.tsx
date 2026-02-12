import type { ProductOutput } from "~/schemas/products";
import type { TenantRole } from "~/schemas/team-membership";

type ProductsTableProps = {
  products: ProductOutput[];
  actorRole: TenantRole;
};

export function ProductsTable({ products, actorRole }: ProductsTableProps) {
  const canViewPurchasePrice = actorRole === "Admin" || actorRole === "Manager";

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
          <p className="text-sm text-gray-600">No products yet.</p>
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
                  SKU
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
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{product.sku ?? "-"}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
