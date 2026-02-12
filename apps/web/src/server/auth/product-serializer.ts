import type { Product } from "~/server/db/schema";
import type { ProductOutput } from "~/schemas/products";
import type { TenantRole } from "~/schemas/team-membership";
import { canViewPurchasePrice, canWritePurchasePrice } from "./rbac-policy";

type ProductRecord = Omit<Product, "purchasePrice"> & {
  purchasePrice?: Product["purchasePrice"];
};

/**
 * Serializes a product for API response based on the user's role.
 * Operators will NOT receive purchasePrice (field is omitted).
 * Admin and Manager will receive all fields.
 */
export function serializeProductForRole(
  product: ProductRecord,
  role: TenantRole
): ProductOutput {
  const baseOutput = {
    id: product.id,
    tenantId: product.tenantId,
    name: product.name,
    description: product.description,
    sku: product.sku,
    price: Number(product.price),
    quantity: product.quantity,
    lowStockThreshold: product.lowStockThreshold,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
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
