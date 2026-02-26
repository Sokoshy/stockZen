"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { productInputBaseSchema } from "~/schemas/products";
import { createProductOffline } from "~/features/offline/product-operations";
import { api } from "~/trpc/react";

const createProductFormSchema = productInputBaseSchema
  .extend({
    name: z.string().min(1, "Name is required").max(255),
    category: z.string().min(1, "Category is required").max(100),
    unit: z.string().min(1, "Unit is required").max(50),
    price: z.number().nonnegative("Price must be non-negative"),
  })
  .superRefine((data, ctx) => {
    const thresholdMode = data.thresholdMode ?? "defaults";

    if (thresholdMode === "custom") {
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
    }
  });

type CreateProductFormData = z.infer<typeof createProductFormSchema>;

interface CreateProductFormProps {
  tenantId: string;
  canWritePurchasePrice: boolean;
  tenantDefaultThresholds?: { criticalThreshold: number; attentionThreshold: number };
  existingCategories?: string[];
  existingUnits?: string[];
}

export function CreateProductForm({
  tenantId,
  canWritePurchasePrice,
  tenantDefaultThresholds = { criticalThreshold: 50, attentionThreshold: 100 },
  existingCategories = [],
  existingUnits = [],
}: CreateProductFormProps) {
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createProductMutation = api.products.create.useMutation({
    onError: (error) => {
      setError(error.message);
    },
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<CreateProductFormData>({
    resolver: zodResolver(createProductFormSchema),
    defaultValues: {
      name: "",
      description: null,
      sku: null,
      category: "",
      unit: "",
      barcode: null,
      price: 0,
      purchasePrice: null,
      quantity: 0,
      lowStockThreshold: null,
      thresholdMode: "defaults",
      customCriticalThreshold: null,
      customAttentionThreshold: null,
    },
  });

  const thresholdMode = useWatch({
    control,
    name: "thresholdMode",
    defaultValue: "defaults",
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

  const onSubmit = async (data: CreateProductFormData) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isOffline) {
        await createProductOffline({
          tenantId,
          name: data.name,
          description: data.description,
          sku: data.sku,
          category: data.category,
          unit: data.unit,
          barcode: data.barcode,
          price: data.price,
          purchasePrice: canWritePurchasePrice ? data.purchasePrice : null,
          quantity: data.quantity ?? 0,
          lowStockThreshold: data.lowStockThreshold,
          thresholdMode: data.thresholdMode,
          customCriticalThreshold: data.customCriticalThreshold,
          customAttentionThreshold: data.customAttentionThreshold,
        });
        setSuccess("Product created offline and queued for sync.");
        reset();
        router.push("/products");
      } else {
        await createProductMutation.mutateAsync({
          name: data.name,
          description: data.description,
          sku: data.sku,
          category: data.category,
          unit: data.unit,
          barcode: data.barcode,
          price: data.price,
          purchasePrice: canWritePurchasePrice ? data.purchasePrice : null,
          quantity: data.quantity ?? 0,
          lowStockThreshold: data.lowStockThreshold,
          thresholdMode: data.thresholdMode,
          customCriticalThreshold: data.customCriticalThreshold,
          customAttentionThreshold: data.customAttentionThreshold,
        });
        setSuccess("Product created successfully.");
        reset();
        router.push("/products");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
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
            list="existing-categories"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {existingCategories.length > 0 && (
            <>
              <datalist id="existing-categories">
                {existingCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-gray-500">
                Reuse existing category names from previous products.
              </p>
            </>
          )}
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
            list="existing-units"
            placeholder="e.g., kg, pcs, box"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {existingUnits.length > 0 && (
            <>
              <datalist id="existing-units">
                {existingUnits.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-gray-500">Reuse existing units from previous products.</p>
            </>
          )}
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
          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
            Initial Quantity
          </label>
          <input
            {...register("quantity", { valueAsNumber: true })}
            type="number"
            id="quantity"
            min="0"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

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
            <div className="mt-2 flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="defaults"
                  {...register("thresholdMode")}
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
                  {...register("thresholdMode")}
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
          {isSubmitting ? "Creating..." : "Create Product"}
        </button>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isOffline}
            onChange={(e) => setIsOffline(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">Save offline (no server sync)</span>
        </label>
      </div>
    </form>
  );
}
