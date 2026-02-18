"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "next/navigation";

import { stockMovementSchema } from "~/schemas/stock-movements";
import {
  createMovement,
  getPendingMovementSyncItems,
  getRecentProductIds,
  markMovementSyncFailed,
  markMovementSynced,
  markMovementSyncing,
} from "~/features/offline/movement-operations";
import { api } from "~/trpc/react";
import { ProductSelector } from "./product-selector";
import { MovementTypeToggle } from "./movement-type-toggle";

const movementFormSchema = stockMovementSchema;

type MovementFormData = z.infer<typeof movementFormSchema>;

interface StockMovementFormProps {
  tenantId: string;
}

export function StockMovementForm({ tenantId }: StockMovementFormProps) {
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recentProducts, setRecentProducts] = useState<
    { id: string; name: string; category: string | null }[]
  >([]);

  const { data: productsData } = api.products.list.useQuery();
  const products = productsData?.products ?? [];

  const createMovementMutation = api.stockMovements.create.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<MovementFormData>({
    resolver: zodResolver(movementFormSchema),
    defaultValues: {
      productId: "",
      type: "entry",
      quantity: 1,
    },
  });

  const selectedProductId = watch("productId");
  const selectedType = watch("type");

  useEffect(() => {
    const productIdFromQuery = searchParams.get("productId");
    if (!productIdFromQuery || selectedProductId) {
      return;
    }

    const hasProduct = products.some((product) => product.id === productIdFromQuery);
    if (hasProduct) {
      setValue("productId", productIdFromQuery, { shouldValidate: true });
    }
  }, [products, searchParams, selectedProductId, setValue]);

  const loadRecentProducts = useCallback(async () => {
    if (products.length === 0) {
      setRecentProducts([]);
      return;
    }

    const productById = new Map(
      products.map((product) => [
        product.id,
        {
          id: product.id,
          name: product.name,
          category: product.category ?? null,
        },
      ])
    );

    const recentProductIds = await getRecentProductIds(tenantId, 5);
    const recent = recentProductIds
      .map((productId) => productById.get(productId))
      .filter((product): product is { id: string; name: string; category: string | null } =>
        Boolean(product)
      );

    if (recent.length === 0) {
      setRecentProducts(
        products.slice(0, 5).map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category ?? null,
        }))
      );
      return;
    }

    setRecentProducts(recent);
  }, [products, tenantId]);

  const syncPendingMovements = useCallback(async () => {
    if (typeof window !== "undefined" && !window.navigator.onLine) {
      return;
    }

    const pendingItems = await getPendingMovementSyncItems(tenantId);

    for (const item of pendingItems) {
      try {
        await markMovementSyncing({
          movementId: item.movementId,
          operationId: item.operationId,
        });

        const response = await createMovementMutation.mutateAsync({
          productId: item.productId,
          type: item.type,
          quantity: item.quantity,
          idempotencyKey: item.idempotencyKey,
        });

        await markMovementSynced({
          movementId: item.movementId,
          operationId: item.operationId,
          serverMovementId: response.id,
        });
      } catch (syncError) {
        await markMovementSyncFailed({
          movementId: item.movementId,
          operationId: item.operationId,
          error: syncError instanceof Error ? syncError.message : "Failed to sync movement",
        });
      }
    }

    await Promise.all([
      utils.products.list.invalidate(),
      utils.stockMovements.getPendingCount.invalidate(),
    ]);
    await loadRecentProducts();
  }, [createMovementMutation, loadRecentProducts, tenantId, utils.products.list, utils.stockMovements.getPendingCount]);

  useEffect(() => {
    void loadRecentProducts();
  }, [loadRecentProducts]);

  useEffect(() => {
    const attemptSync = () => {
      void syncPendingMovements();
    };

    void syncPendingMovements();
    window.addEventListener("online", attemptSync);
    const interval = window.setInterval(attemptSync, 10000);

    return () => {
      window.removeEventListener("online", attemptSync);
      window.clearInterval(interval);
    };
  }, [syncPendingMovements]);

  const onSubmit = async (data: MovementFormData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const selectedProduct = products.find((product) => product.id === data.productId);
      if (!selectedProduct) {
        setError("Please select a valid product");
        return;
      }

      // Always save locally first (offline-first approach)
      await createMovement({
        tenantId,
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        productSnapshot: {
          name: selectedProduct.name,
          description: selectedProduct.description,
          sku: selectedProduct.sku,
          category: selectedProduct.category,
          unit: selectedProduct.unit,
          barcode: selectedProduct.barcode,
          price: selectedProduct.price,
          purchasePrice:
            "purchasePrice" in selectedProduct ? selectedProduct.purchasePrice ?? null : null,
          quantity: selectedProduct.quantity,
          lowStockThreshold: selectedProduct.lowStockThreshold,
        },
      });

      setSuccess(
        `Stock ${data.type === "entry" ? "entry" : "exit"} recorded successfully.`
      );

      await Promise.all([
        utils.products.list.invalidate(),
        utils.stockMovements.getPendingCount.invalidate(),
      ]);
      await loadRecentProducts();

      void syncPendingMovements();

      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record movement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductSelect = useCallback(
    (productId: string) => {
      setValue("productId", productId, { shouldValidate: true });
    },
    [setValue]
  );

  const handleTypeChange = useCallback(
    (type: "entry" | "exit") => {
      setValue("type", type, { shouldValidate: true });
    },
    [setValue]
  );

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Product Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Product</label>
          <ProductSelector
            products={products}
            recentProducts={recentProducts}
            selectedProductId={selectedProductId}
            onSelect={handleProductSelect}
            error={errors.productId?.message}
          />
        </div>

        {/* Movement Type Toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Movement Type</label>
          <MovementTypeToggle
            value={selectedType}
            onChange={handleTypeChange}
          />
        </div>

        {/* Quantity Input */}
        <div className="space-y-2">
          <label htmlFor="quantity" className="text-sm font-medium">
            Quantity
          </label>
          <input
            {...register("quantity", { valueAsNumber: true })}
            id="quantity"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            autoFocus
            className="w-full px-3 py-2 border rounded-md text-lg h-14 text-center"
            placeholder="Enter quantity"
            aria-invalid={errors.quantity ? "true" : "false"}
          />
          {errors.quantity && (
            <p className="text-sm text-red-600">{errors.quantity.message}</p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-4 bg-blue-600 text-white rounded-md font-medium text-lg h-14 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          {isSubmitting
            ? "Recording..."
            : `Record ${selectedType === "entry" ? "Entry" : "Exit"}`}
        </button>
      </form>
    </div>
  );
}
