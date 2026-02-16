import { z } from "zod";

export const stockMovementTypeSchema = z.enum(["entry", "exit"]);

export const stockMovementSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  type: stockMovementTypeSchema,
  quantity: z.number().int().positive("Quantity must be greater than 0"),
});

export const stockMovementSyncSchema = stockMovementSchema.extend({
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockMovementSyncInput = z.infer<typeof stockMovementSyncSchema>;

// Extended schema for local storage with metadata
export const localStockMovementSchema = stockMovementSchema.extend({
  id: z.string(),
  tenantId: z.string(),
  idempotencyKey: z.string(),
  clientCreatedAt: z.string(),
  serverCreatedAt: z.string().optional(),
  syncedAt: z.string().optional(),
  syncStatus: z.enum(["pending", "synced", "failed"]),
});

export type LocalStockMovement = z.infer<typeof localStockMovementSchema>;
