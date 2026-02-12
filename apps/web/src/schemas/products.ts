import { z } from "zod";
import { tenantRoleSchema } from "./team-membership";

export const productSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable(),
  sku: z.string().min(1).max(100).nullable(),
  price: z.number().nonnegative(), // Sale price (visible to all roles)
  purchasePrice: z.number().nonnegative().nullable(), // Cost (hidden from Operators)
  quantity: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Product = z.infer<typeof productSchema>;

// Input schema for creating/updating products
export const productInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  sku: z.string().min(1).max(100).optional(),
  price: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().optional(),
  quantity: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

// Role-aware product output schemas
export const operatorProductOutputSchema = productSchema.omit({
  purchasePrice: true,
});

export const adminManagerProductOutputSchema = productSchema;
export const productOutputSchema = z.union([
  adminManagerProductOutputSchema,
  operatorProductOutputSchema,
]);

// Type exports
export type OperatorProductOutput = z.infer<typeof operatorProductOutputSchema>;
export type AdminManagerProductOutput = z.infer<typeof adminManagerProductOutputSchema>;

// Union type for any product output
export type ProductOutput = OperatorProductOutput | AdminManagerProductOutput;

// List output schemas
export const listProductsOutputSchema = z.object({
  products: z.array(productOutputSchema),
  actorRole: tenantRoleSchema,
});

export type ListProductsOutput = z.infer<typeof listProductsOutputSchema>;
