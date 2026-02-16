"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { productInputSchema } from "~/schemas/products";
import { updateProductOffline } from "~/features/offline/product-operations";
import { api } from "~/trpc/react";

const editProductFormSchema = productInputSchema.partial();

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
  };
  tenantId: string;
  canWritePurchasePrice: boolean;
  serverAvailable?: boolean;
}

export function EditProductForm({
  product,
  tenantId,
  canWritePurchasePrice,
  serverAvailable = true,
}: EditProductFormProps) {
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(!serverAvailable);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateProductMutation = api.products.update.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  const {
    register,
    handleSubmit,
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
    },
  });

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
          <label
            htmlFor="lowStockThreshold"
            className="block text-sm font-medium text-gray-700"
          >
            Low Stock Threshold
          </label>
          <input
            {...register("lowStockThreshold", { valueAsNumber: true })}
            type="number"
            id="lowStockThreshold"
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

        <div>
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

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
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
