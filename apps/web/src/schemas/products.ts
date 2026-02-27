import { z } from "zod";
import { tenantRoleSchema } from "./team-membership";

export const thresholdModeSchema = z.enum(["defaults", "custom"]);
export type ThresholdMode = z.infer<typeof thresholdModeSchema>;

export function hasValidCustomThresholdPair(
  criticalThreshold: number | null | undefined,
  attentionThreshold: number | null | undefined
): boolean {
  return (
    typeof criticalThreshold === "number" &&
    Number.isInteger(criticalThreshold) &&
    criticalThreshold > 0 &&
    typeof attentionThreshold === "number" &&
    Number.isInteger(attentionThreshold) &&
    attentionThreshold > 0 &&
    criticalThreshold < attentionThreshold
  );
}

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
  thresholdMode: thresholdModeSchema,
  customCriticalThreshold: z.number().int().positive().nullable(),
  customAttentionThreshold: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type Product = z.infer<typeof productSchema>;

const customThresholdsSchema = z.object({
  criticalThreshold: z
    .number({ invalid_type_error: "Critical threshold must be a number" })
    .int("Critical threshold must be an integer")
    .positive("Critical threshold must be greater than 0"),
  attentionThreshold: z
    .number({ invalid_type_error: "Attention threshold must be a number" })
    .int("Attention threshold must be an integer")
    .positive("Attention threshold must be greater than 0"),
}).refine(
  (data) => data.criticalThreshold < data.attentionThreshold,
  {
    message: "Critical threshold must be less than attention threshold",
    path: ["criticalThreshold"],
  }
);

export const productInputBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).nullable().optional(),
  sku: z.string().min(1).max(100).nullable().optional(),
  category: z.string().min(1).max(100).nullable().optional(),
  unit: z.string().min(1).max(50).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  price: z.number().nonnegative("Price must be non-negative"),
  purchasePrice: z.number().nonnegative().nullable().optional(),
  quantity: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  thresholdMode: thresholdModeSchema.optional(),
  customCriticalThreshold: z.number().int().positive().nullable().optional(),
  customAttentionThreshold: z.number().int().positive().nullable().optional(),
});

export const productInputSchema = productInputBaseSchema.superRefine((data, ctx) => {
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

export const productUpdateDataSchema = productInputBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    const hasCustomCritical = data.customCriticalThreshold !== undefined;
    const hasCustomAttention = data.customAttentionThreshold !== undefined;
    const thresholdMode = data.thresholdMode;

    if (thresholdMode === undefined) {
      if (hasCustomCritical || hasCustomAttention) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "thresholdMode is required when updating custom thresholds",
          path: ["thresholdMode"],
        });
      }
      return;
    }

    if (thresholdMode === "defaults") {
      if (
        (data.customCriticalThreshold !== undefined &&
          data.customCriticalThreshold !== null) ||
        (data.customAttentionThreshold !== undefined &&
          data.customAttentionThreshold !== null)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom thresholds must be omitted when using tenant defaults",
          path: ["thresholdMode"],
        });
      }
      return;
    }

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
      !hasValidCustomThresholdPair(
        data.customCriticalThreshold,
        data.customAttentionThreshold
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Critical threshold must be less than attention threshold",
        path: ["customCriticalThreshold"],
      });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateDataInput = z.infer<typeof productUpdateDataSchema>;

export const customThresholdsInputSchema = customThresholdsSchema;
export type CustomThresholdsInput = z.infer<typeof customThresholdsInputSchema>;

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

export const alertMetadataSchema = z.object({
  alertLevel: z.enum(["red", "orange", "green"]).nullable(),
  hasActiveAlert: z.boolean(),
  activeAlertUpdatedAt: z.string().datetime().nullable(),
});

export type AlertMetadata = z.infer<typeof alertMetadataSchema>;

export const productWithAlertMetadataSchema = productSchema.extend({
  alertLevel: z.enum(["red", "orange", "green"]).nullable(),
  hasActiveAlert: z.boolean(),
  activeAlertUpdatedAt: z.string().datetime().nullable(),
});

export const operatorProductWithAlertMetadataSchema = operatorProductOutputSchema.extend({
  alertLevel: z.enum(["red", "orange", "green"]).nullable(),
  hasActiveAlert: z.boolean(),
  activeAlertUpdatedAt: z.string().datetime().nullable(),
});

export const adminManagerProductWithAlertMetadataSchema = adminManagerProductOutputSchema.extend({
  alertLevel: z.enum(["red", "orange", "green"]).nullable(),
  hasActiveAlert: z.boolean(),
  activeAlertUpdatedAt: z.string().datetime().nullable(),
});

export const productWithAlertOutputSchema = z.union([
  adminManagerProductWithAlertMetadataSchema,
  operatorProductWithAlertMetadataSchema,
]);

export type ProductWithAlertOutput = z.infer<typeof productWithAlertOutputSchema>;
export type OperatorProductWithAlertOutput = z.infer<typeof operatorProductWithAlertMetadataSchema>;
export type AdminManagerProductWithAlertOutput = z.infer<typeof adminManagerProductWithAlertMetadataSchema>;

export const listProductsOutputSchema = z.object({
  products: z.array(productWithAlertOutputSchema),
  actorRole: tenantRoleSchema,
});

export type ListProductsOutput = z.infer<typeof listProductsOutputSchema>;

export const productImportInputSchema = z.object({
  file: z.instanceof(File),
});

export const productImportOutputSchema = z.object({
  success: z.boolean(),
  importedCount: z.number(),
  totalRows: z.number(),
  errors: z.array(
    z.object({
      rowNumber: z.number(),
      field: z.string(),
      message: z.string(),
    })
  ),
  errorReportUrl: z.string().optional(),
});

export type ProductImportOutput = z.infer<typeof productImportOutputSchema>;
