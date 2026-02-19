import { z } from "zod";

export const syncOperationTypeSchema = z.enum(["create", "update", "delete"]);
export const syncEntityTypeSchema = z.enum(["product", "stockMovement"]);

export const syncOperationSchema = z.object({
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  entityId: z.string().min(1),
  entityType: syncEntityTypeSchema,
  operationType: syncOperationTypeSchema,
  tenantId: z.string().min(1),
  payload: z.record(z.unknown()),
}).superRefine((operation, ctx) => {
  if (operation.idempotencyKey !== operation.operationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idempotencyKey"],
      message: "idempotencyKey must match operationId",
    });
  }
});

export const syncRequestSchema = z.object({
  checkpoint: z.string().optional(),
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export const syncResultStatusSchema = z.enum([
  "success",
  "duplicate",
  "conflict_resolved",
  "validation_error",
  "tenant_mismatch",
  "not_found",
  "rate_limited",
]);

export const syncResultSchema = z.object({
  operationId: z.string(),
  status: syncResultStatusSchema,
  code: z.string().optional(),
  message: z.string().optional(),
  serverState: z.record(z.unknown()).optional(),
});

export const syncResponseSchema = z.object({
  checkpoint: z.string(),
  results: z.array(syncResultSchema),
});

export const syncErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type SyncOperationType = z.infer<typeof syncOperationTypeSchema>;
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncResultStatus = z.infer<typeof syncResultStatusSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type SyncError = z.infer<typeof syncErrorSchema>;
