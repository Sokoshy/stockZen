import { z } from "zod";
import { tenantRoleSchema } from "./team-membership";

export const productSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable(),
  sku: z.string().min(1).max(100).nullable(),
  category: z.string().min(1).max(100).nullable(),
  unit: z.string().min(1).max(50).nullable(),
  barcode: z.string().max(100).nullable(),
  price: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().nullable(),
  quantity: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Product = z.infer<typeof productSchema>;

export const productInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  sku: z.string().min(1).max(100).nullable().optional(),
  category: z.string().min(1).max(100).nullable().optional(),
  unit: z.string().min(1).max(50).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().nullable().optional(),
  quantity: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const operatorProductOutputSchema = productSchema.omit({
  purchasePrice: true,
});

export const adminManagerProductOutputSchema = productSchema;
export const productOutputSchema = z.union([
  adminManagerProductOutputSchema,
  operatorProductOutputSchema,
]);

export type OperatorProductOutput = z.infer<typeof operatorProductOutputSchema>;
export type AdminManagerProductOutput = z.infer<typeof adminManagerProductOutputSchema>;

export type ProductOutput = OperatorProductOutput | AdminManagerProductOutput;

export const listProductsOutputSchema = z.object({
  products: z.array(productOutputSchema),
  actorRole: tenantRoleSchema,
});

export type ListProductsOutput = z.infer<typeof listProductsOutputSchema>;
