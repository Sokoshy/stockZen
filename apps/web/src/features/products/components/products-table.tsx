"use client";

import { useEffect, useMemo, useState } from "react";

import type { LocalProduct } from "~/features/offline/database";
import { getLocalProducts } from "~/features/offline/product-operations";
import type { ProductOutput } from "~/schemas/products";
import type { TenantRole } from "~/schemas/team-membership";

type ProductsTableProps = {
  products: ProductOutput[];
  actorRole: TenantRole;
  tenantId: string;
};

type ProductRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  unit: string | null;
  barcode: string | null;
  price: number;
  purchasePrice?: number | null;
  quantity: number;
  lowStockThreshold: number | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: "pending" | "synced" | "failed";
};

function toServerProductRow(product: ProductOutput): ProductRow {
  return {
    id: product.id,
    tenantId: product.tenantId,
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    unit: product.unit,
    barcode: product.barcode,
    price: product.price,
    purchasePrice: "purchasePrice" in product ? product.purchasePrice : undefined,
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    syncStatus: "synced",
  };
}

function toLocalProductRow(product: LocalProduct, canViewPurchasePrice: boolean): ProductRow {
  return {
    id: product.id,
    tenantId: product.tenantId,
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    unit: product.unit,
    barcode: product.barcode,
    price: product.price,
    purchasePrice: canViewPurchasePrice ? product.purchasePrice : undefined,
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    syncStatus: product.syncStatus,
  };
}

export function ProductsTable({ products, actorRole, tenantId }: ProductsTableProps) {
  const canViewPurchasePrice = actorRole === "Admin" || actorRole === "Manager";
  const [localProducts, setLocalProducts] = useState<LocalProduct[]>([]);

  useEffect(() => {
    let cancelled = false;

    void getLocalProducts(tenantId)
      .then((items) => {
        if (!cancelled) {
          setLocalProducts(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalProducts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const mergedProducts = useMemo(() => {
    const byId = new Map<string, ProductRow>();

    for (const product of products) {
      byId.set(product.id, toServerProductRow(product));
    }

    for (const localProduct of localProducts) {
      const localRow = toLocalProductRow(localProduct, canViewPurchasePrice);
      const existing = byId.get(localProduct.id);

      if (!existing) {
        byId.set(localProduct.id, localRow);
        continue;
      }

      if (localProduct.syncStatus !== "synced") {
        byId.set(localProduct.id, {
          ...existing,
          syncStatus: localProduct.syncStatus,
          updatedAt:
            localProduct.updatedAt > existing.updatedAt
              ? localProduct.updatedAt
              : existing.updatedAt,
        });
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [canViewPurchasePrice, localProducts, products]);

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

      {mergedProducts.length === 0 ? (
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
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {mergedProducts.map((product) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
