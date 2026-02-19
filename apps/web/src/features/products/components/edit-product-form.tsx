"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { productInputBaseSchema, type ThresholdMode } from "~/schemas/products";
import { updateProductOffline } from "~/features/offline/product-operations";
import { api } from "~/trpc/react";

const editProductFormSchema = productInputBaseSchema.partial().superRefine((data, ctx) => {
  const thresholdMode = data.thresholdMode;

  if (thresholdMode === undefined) {
    return;
  }

  if (thresholdMode === "defaults") {
    return;
  }

  if (data.customCriticalThreshold === undefined || data.customCriticalThreshold === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Critical threshold is required when using custom thresholds",
      path: ["customCriticalThreshold"],
    });
  }

  if (data.customAttentionThreshold === undefined || data.customAttentionThreshold === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attention threshold is required when using custom thresholds",
      path: ["customAttentionThreshold"],
    });
  }

  if (
    data.customCriticalThreshold !== undefined &&
    data.customCriticalThreshold !== null &&
    data.customAttentionThreshold !== undefined &&
    data.customAttentionThreshold !== null &&
    data.customCriticalThreshold >= data.customAttentionThreshold
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Critical threshold must be less than attention threshold",
      path: ["customCriticalThreshold"],
    });
  }
});

type EditProductFormData = z.infer<typeof editProductFormSchema>;

interface EditProductFormProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    sku: string | null;
    category: string | null;
    unit: string | null;
    barcode: string | null;
    price: number;
    purchasePrice: number | null;
    lowStockThreshold: number | null;
    thresholdMode?: ThresholdMode;
    customCriticalThreshold?: number | null;
    customAttentionThreshold?: number | null;
  };
  tenantId: string;
  canWritePurchasePrice: boolean;
  serverAvailable?: boolean;
  tenantDefaultThresholds?: { criticalThreshold: number; attentionThreshold: number };
}

export function EditProductForm({
  product,
  tenantId,
  canWritePurchasePrice,
  serverAvailable = true,
  tenantDefaultThresholds = { criticalThreshold: 50, attentionThreshold: 100 },
}: EditProductFormProps) {
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(!serverAvailable);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingThresholdMode, setPendingThresholdMode] = useState<ThresholdMode | null>(null);

  const updateProductMutation = api.products.update.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  const currentThresholdMode = product.thresholdMode ?? "defaults";
  const hasCustomThresholds = product.customCriticalThreshold !== null && product.customAttentionThreshold !== null;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
    reset,
  } = useForm<EditProductFormData>({
    resolver: zodResolver(editProductFormSchema),
    defaultValues: {
      name: product.name,
      description: product.description ?? undefined,
      sku: product.sku ?? undefined,
      category: product.category ?? undefined,
      unit: product.unit ?? undefined,
      barcode: product.barcode ?? undefined,
      price: product.price,
      purchasePrice: product.purchasePrice ?? undefined,
      lowStockThreshold: product.lowStockThreshold ?? undefined,
      thresholdMode: currentThresholdMode,
      customCriticalThreshold: product.customCriticalThreshold ?? undefined,
      customAttentionThreshold: product.customAttentionThreshold ?? undefined,
    },
  });

  const thresholdMode = useWatch({
    control,
    name: "thresholdMode",
    defaultValue: currentThresholdMode,
  });
  const customCriticalThreshold = useWatch({
    control,
    name: "customCriticalThreshold",
  });
  const customAttentionThreshold = useWatch({
    control,
    name: "customAttentionThreshold",
  });

  const customThresholdInvalid =
    thresholdMode === "custom" &&
    !(
      Number.isInteger(customCriticalThreshold) &&
      Number.isInteger(customAttentionThreshold) &&
      (customCriticalThreshold as number) > 0 &&
      (customAttentionThreshold as number) > 0 &&
      (customCriticalThreshold as number) < (customAttentionThreshold as number)
    );

  const handleThresholdModeChange = (newMode: ThresholdMode) => {
    if (hasCustomThresholds && newMode === "defaults") {
      setPendingThresholdMode(newMode);
      setShowClearConfirm(true);
    } else {
      setValue("thresholdMode", newMode);
      if (newMode === "defaults") {
        setValue("customCriticalThreshold", null);
        setValue("customAttentionThreshold", null);
      }
    }
  };

  const confirmClearThresholds = () => {
    if (pendingThresholdMode) {
      setValue("thresholdMode", pendingThresholdMode);
      setValue("customCriticalThreshold", null);
      setValue("customAttentionThreshold", null);
    }
    setShowClearConfirm(false);
    setPendingThresholdMode(null);
  };

  const cancelClearThresholds = () => {
    setShowClearConfirm(false);
    setPendingThresholdMode(null);
  };

  const onSubmit = async (data: EditProductFormData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isOffline || !serverAvailable) {
        await updateProductOffline({
          id: product.id,
          tenantId,
          name: data.name,
          description: data.description ?? null,
          sku: data.sku ?? null,
          category: data.category ?? "",
          unit: data.unit ?? "",
          barcode: data.barcode ?? null,
          price: data.price ?? product.price,
          purchasePrice: canWritePurchasePrice ? (data.purchasePrice ?? null) : null,
          lowStockThreshold: data.lowStockThreshold ?? null,
          thresholdMode: data.thresholdMode,
          customCriticalThreshold: data.customCriticalThreshold,
          customAttentionThreshold: data.customAttentionThreshold,
        });
        setSuccess("Product updated offline and queued for sync.");
        setTimeout(() => router.push("/products"), 1500);
      } else {
        await updateProductMutation.mutateAsync({
          id: product.id,
          data: {
            name: data.name,
            description: data.description,
            sku: data.sku,
            category: data.category,
            unit: data.unit,
            barcode: data.barcode,
            price: data.price,
            purchasePrice: canWritePurchasePrice ? data.purchasePrice : undefined,
            lowStockThreshold: data.lowStockThreshold,
            thresholdMode: data.thresholdMode,
            customCriticalThreshold: data.customCriticalThreshold,
            customAttentionThreshold: data.customAttentionThreshold,
          },
        });
        setSuccess("Product updated successfully.");
        setTimeout(() => router.push("/products"), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {success && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-700" role="status">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {showClearConfirm && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Clear custom thresholds?</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  This product has custom thresholds (Critical: {product.customCriticalThreshold}, Attention: {product.customAttentionThreshold}).
                  Switching to tenant defaults will remove these custom values. This action cannot be undone.
                </p>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={confirmClearThresholds}
                  className="rounded-md bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-200"
                >
                  Yes, use defaults
                </button>
                <button
                  type="button"
                  onClick={cancelClearThresholds}
                  className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Name *
          </label>
          <input
            {...register("name")}
            type="text"
            id="name"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category *
          </label>
          <input
            {...register("category")}
            type="text"
            id="category"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.category && (
            <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="unit" className="block text-sm font-medium text-gray-700">
            Unit *
          </label>
          <input
            {...register("unit")}
            type="text"
            id="unit"
            placeholder="e.g., kg, pcs, box"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.unit && <p className="mt-1 text-sm text-red-600">{errors.unit.message}</p>}
        </div>

        <div>
          <label htmlFor="barcode" className="block text-sm font-medium text-gray-700">
            Barcode (optional)
          </label>
          <input
            {...register("barcode")}
            type="text"
            id="barcode"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.barcode && (
            <p className="mt-1 text-sm text-red-600">{errors.barcode.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">
            Sale Price *
          </label>
          <input
            {...register("price", { valueAsNumber: true })}
            type="number"
            id="price"
            step="0.01"
            min="0"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.price && (
            <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>
          )}
        </div>

        {canWritePurchasePrice && (
          <div>
            <label htmlFor="purchasePrice" className="block text-sm font-medium text-gray-700">
              Purchase Price (Cost)
            </label>
            <input
              {...register("purchasePrice", { valueAsNumber: true })}
              type="number"
              id="purchasePrice"
              step="0.01"
              min="0"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.purchasePrice && (
              <p className="mt-1 text-sm text-red-600">{errors.purchasePrice.message}</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
            SKU (optional)
          </label>
          <input
            {...register("sku", {
              setValueAs: (value) =>
                typeof value === "string" && value.trim() === "" ? null : value,
            })}
            type="text"
            id="sku"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            {...register("description")}
            id="description"
            rows={2}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Stock Thresholds</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Threshold Mode</label>
            <p className="text-xs text-gray-500 mb-2">
              Current mode: <span className="font-medium">{currentThresholdMode === "custom" ? "Custom thresholds" : "Tenant defaults"}</span>
            </p>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="defaults"
                  checked={thresholdMode === "defaults"}
                  onChange={() => handleThresholdModeChange("defaults")}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Use tenant defaults (Critical: {tenantDefaultThresholds.criticalThreshold}, Attention: {tenantDefaultThresholds.attentionThreshold})
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="custom"
                  checked={thresholdMode === "custom"}
                  onChange={() => handleThresholdModeChange("custom")}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Customize thresholds</span>
              </label>
            </div>
          </div>

          {thresholdMode === "custom" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 bg-gray-50 p-4 rounded-md">
              <div>
                <label htmlFor="customCriticalThreshold" className="block text-sm font-medium text-gray-700">
                  Critical Threshold *
                </label>
                <input
                  {...register("customCriticalThreshold", { valueAsNumber: true })}
                  type="number"
                  id="customCriticalThreshold"
                  min="1"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {errors.customCriticalThreshold && (
                  <p className="mt-1 text-sm text-red-600">{errors.customCriticalThreshold.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="customAttentionThreshold" className="block text-sm font-medium text-gray-700">
                  Attention Threshold *
                </label>
                <input
                  {...register("customAttentionThreshold", { valueAsNumber: true })}
                  type="number"
                  id="customAttentionThreshold"
                  min="1"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {errors.customAttentionThreshold && (
                  <p className="mt-1 text-sm text-red-600">{errors.customAttentionThreshold.message}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 md:col-span-2">
                Critical threshold must be less than attention threshold. Both must be positive integers.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting || customThresholdInvalid}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/products")}
          className="inline-flex items-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Cancel
        </button>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isOffline}
            onChange={(e) => setIsOffline(e.target.checked)}
            disabled={!serverAvailable}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            {serverAvailable
              ? "Save offline (no server sync)"
              : "Offline-only product (will sync later)"}
          </span>
        </label>
      </div>
    </form>
  );
}
