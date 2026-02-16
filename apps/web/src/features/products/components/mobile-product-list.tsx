"use client";

import { SwipeableProductCard } from "./swipeable-product-card";
import type { TenantRole } from "~/schemas/team-membership";
import type { ProductRow } from "../utils/filter-utils";

interface MobileProductListProps {
  products: ProductRow[];
  actorRole: TenantRole;
  tenantId: string;
  onProductDeleted: (productId: string) => void;
  onProductRestored: (productId: string) => void;
}

export function MobileProductList({
  products,
  actorRole,
  tenantId,
  onProductDeleted,
  onProductRestored,
}: MobileProductListProps) {
  const canViewPurchasePrice = actorRole === "Admin" || actorRole === "Manager";

  if (products.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-600">No products found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((product) => (
        <SwipeableProductCard
          key={product.id}
          product={product}
          actorRole={actorRole}
          tenantId={tenantId}
          onDeleted={() => onProductDeleted(product.id)}
          onRestored={() => onProductRestored(product.id)}
          canViewPurchasePrice={canViewPurchasePrice}
        />
      ))}
    </div>
  );
}
