"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type LocalProduct } from "~/features/offline/database";
import { getLocalProductById } from "~/features/offline/product-operations";
import { api } from "~/trpc/react";
import { EditProductForm } from "./edit-product-form";

type EditProductPageClientProps = {
  productId: string;
  tenantId: string;
  canWritePurchasePrice: boolean;
};

export function EditProductPageClient({
  productId,
  tenantId,
  canWritePurchasePrice,
}: EditProductPageClientProps) {
  const [localProduct, setLocalProduct] = useState<LocalProduct | null>(null);
  const [localChecked, setLocalChecked] = useState(false);

  const serverProductQuery = api.products.getById.useQuery(
    { id: productId },
    {
      retry: false,
    }
  );

  useEffect(() => {
    let cancelled = false;

    if (!serverProductQuery.isError) {
      return;
    }

    void getLocalProductById(productId, tenantId)
      .then((product) => {
        if (cancelled) {
          return;
        }
        setLocalProduct(product ?? null);
        setLocalChecked(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLocalProduct(null);
        setLocalChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [productId, tenantId, serverProductQuery.isError]);

  if (serverProductQuery.isLoading || (serverProductQuery.isError && !localChecked)) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-sm text-gray-600">Loading product...</p>
      </div>
    );
  }

  if (serverProductQuery.data) {
    const product = serverProductQuery.data;

    return (
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
            purchasePrice: "purchasePrice" in product ? product.purchasePrice : null,
            lowStockThreshold: product.lowStockThreshold,
          }}
          tenantId={tenantId}
          canWritePurchasePrice={canWritePurchasePrice}
          serverAvailable
        />
      </div>
    );
  }

  if (localProduct) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          This product exists locally only. Changes will be saved offline and synced later.
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <EditProductForm
            product={{
              id: localProduct.id,
              name: localProduct.name,
              description: localProduct.description,
              sku: localProduct.sku,
              category: localProduct.category,
              unit: localProduct.unit,
              barcode: localProduct.barcode,
              price: localProduct.price,
              purchasePrice: localProduct.purchasePrice,
              lowStockThreshold: localProduct.lowStockThreshold,
            }}
            tenantId={tenantId}
            canWritePurchasePrice={canWritePurchasePrice}
            serverAvailable={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <p className="text-sm text-red-600">Product not found for this tenant.</p>
      <Link
        href="/products"
        className="mt-4 inline-flex items-center rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
      >
        Back to products
      </Link>
    </div>
  );
}
