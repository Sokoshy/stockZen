import { z } from "zod";

export const alertLevelSchema = z.enum(["red", "orange", "green"]);
export type AlertLevel = z.infer<typeof alertLevelSchema>;

export const alertStatusSchema = z.enum(["active", "closed"]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const alertSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  level: alertLevelSchema,
  status: alertStatusSchema,
  stockAtCreation: z.number().int(),
  currentStock: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});

export type Alert = z.infer<typeof alertSchema>;

export const alertMetadataSchema = z.object({
  alertLevel: alertLevelSchema.nullable(),
  hasActiveAlert: z.boolean(),
  activeAlertUpdatedAt: z.string().datetime().nullable(),
});

export type AlertMetadata = z.infer<typeof alertMetadataSchema>;
