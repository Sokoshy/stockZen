import type { Product } from "~/server/db/schema";
import type { ProductOutput } from "~/schemas/products";
import type { TenantRole } from "~/schemas/team-membership";
import { hasValidCustomThresholdPair } from "~/schemas/products";
import { canViewPurchasePrice, canWritePurchasePrice } from "./rbac-policy";

type ProductRecord = Omit<Product, "purchasePrice"> & {
  purchasePrice?: Product["purchasePrice"];
};

function deriveThresholdMode(product: ProductRecord): "defaults" | "custom" {
  if (
    hasValidCustomThresholdPair(
      product.customCriticalThreshold,
      product.customAttentionThreshold
    )
  ) {
    return "custom";
  }
  return "defaults";
}

export function serializeProductForRole(
  product: ProductRecord,
  role: TenantRole
): ProductOutput {
  const thresholdMode = deriveThresholdMode(product);
  
  const baseOutput = {
    id: product.id,
    tenantId: product.tenantId,
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    unit: product.unit,
    barcode: product.barcode,
    price: Number(product.price),
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    thresholdMode,
    customCriticalThreshold: product.customCriticalThreshold,
    customAttentionThreshold: product.customAttentionThreshold,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    deletedAt: product.deletedAt ? product.deletedAt.toISOString() : null,
  };

  if (canViewPurchasePrice(role)) {
    return {
      ...baseOutput,
      purchasePrice:
        product.purchasePrice === null || product.purchasePrice === undefined
          ? null
          : Number(product.purchasePrice),
    };
  }

  return baseOutput;
}

/**
 * Serializes an array of products for API response based on the user's role.
 */
export function serializeProductsForRole(
  products: ProductRecord[],
  role: TenantRole
): ProductOutput[] {
  return products.map((product) => serializeProductForRole(product, role));
}

/**
 * Sanitizes product input to remove purchasePrice for Operators.
 * Returns a new object without purchasePrice if the role cannot write it.
 */
export function sanitizeProductInputForRole<T extends { purchasePrice?: number | null }>(
  input: T,
  role: TenantRole
): Omit<T, "purchasePrice"> | T {
  if (!canWritePurchasePrice(role)) {
    const { purchasePrice: _, ...sanitized } = input;
    return sanitized;
  }
  return input;
}
