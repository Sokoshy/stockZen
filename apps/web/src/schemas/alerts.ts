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
  handledAt: z.string().datetime().nullable(),
  snoozedUntil: z.string().datetime().nullable(),
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

export const markHandledInputSchema = z.object({
  alertId: z.string().uuid(),
});

export type MarkHandledInput = z.infer<typeof markHandledInputSchema>;

export const snoozeAlertInputSchema = z.object({
  alertId: z.string().uuid(),
});

export type SnoozeAlertInput = z.infer<typeof snoozeAlertInputSchema>;

export const listActiveAlertsInputSchema = z.object({});

export type ListActiveAlertsInput = z.infer<typeof listActiveAlertsInputSchema>;

export const activeAlertSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  level: alertLevelSchema,
  currentStock: z.number().int(),
  snoozedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ActiveAlert = z.infer<typeof activeAlertSchema>;

export const listActiveAlertsOutputSchema = z.object({
  alerts: z.array(activeAlertSchema),
});

export type ListActiveAlertsOutput = z.infer<typeof listActiveAlertsOutputSchema>;
