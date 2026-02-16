"use client";

import { useEffect, useMemo, useState } from "react";
import type { TenantRole } from "~/schemas/team-membership";
import type { ProductOutput } from "~/schemas/products";
import type { LocalProduct } from "~/features/offline/database";
import { getLocalProducts } from "~/features/offline/product-operations";
import { ProductsTable } from "../components/products-table";
import { ProductFilters } from "../components/product-filters";
import { useProductFilters } from "../hooks/use-product-filters";
import { MobileProductList } from "../components/mobile-product-list";
import { SyncStatusSummary } from "../components/sync-status-summary";
import type { ProductRow } from "../utils/filter-utils";

interface ProductsListClientProps {
  serverProducts: ProductOutput[];
  actorRole: TenantRole;
  tenantId: string;
}

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

export function ProductsListClient({
  serverProducts,
  actorRole,
  tenantId,
}: ProductsListClientProps) {
  const canViewPurchasePrice = actorRole === "Admin" || actorRole === "Manager";
  const [localProducts, setLocalProducts] = useState<LocalProduct[]>([]);
  const [deletedProductIds, setDeletedProductIds] = useState<Set<string>>(new Set());

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

  const mergedProducts = useMemo((): ProductRow[] => {
    const byId = new Map<string, ProductRow>();

    for (const product of serverProducts) {
      if (!deletedProductIds.has(product.id)) {
        byId.set(product.id, toServerProductRow(product));
      }
    }

    for (const localProduct of localProducts) {
      if (deletedProductIds.has(localProduct.id)) {
        continue;
      }

      const localRow = toLocalProductRow(localProduct, canViewPurchasePrice);
      const existing = byId.get(localProduct.id);

      if (!existing) {
        byId.set(localProduct.id, localRow);
        continue;
      }

      if (localProduct.syncStatus !== "synced" || localProduct.updatedAt >= existing.updatedAt) {
        byId.set(localProduct.id, localRow);
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [canViewPurchasePrice, localProducts, serverProducts, deletedProductIds]);

  const {
    filters,
    filteredProducts,
    availableCategories,
    isPending,
    setCategory,
    setSearchQuery,
    setOnAlert,
    clearFilters,
  } = useProductFilters(mergedProducts);

  const handleProductDeleted = (productId: string) => {
    setDeletedProductIds((prev) => {
      const next = new Set(prev);
      next.add(productId);
      return next;
    });

    void getLocalProducts(tenantId).then(setLocalProducts);
  };

  const handleProductRestored = (productId: string) => {
    setDeletedProductIds((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });

    void getLocalProducts(tenantId).then(setLocalProducts);
  };

  return (
    <div className="space-y-4">
      <SyncStatusSummary tenantId={tenantId} />

      <ProductFilters
        filters={filters}
        availableCategories={availableCategories}
        onCategoryChange={setCategory}
        onSearchChange={setSearchQuery}
        onOnAlertChange={setOnAlert}
        onClear={clearFilters}
        isPending={isPending}
        resultCount={filteredProducts.length}
        totalCount={mergedProducts.length}
      />

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <ProductsTable
          products={filteredProducts}
          actorRole={actorRole}
          tenantId={tenantId}
          onProductDeleted={handleProductDeleted}
          onProductRestored={handleProductRestored}
        />
      </div>

      {/* Mobile Card View with Swipe Actions */}
      <div className="sm:hidden">
        <MobileProductList
          products={filteredProducts}
          actorRole={actorRole}
          tenantId={tenantId}
          onProductDeleted={handleProductDeleted}
          onProductRestored={handleProductRestored}
        />
      </div>
    </div>
  );
}
