import { z } from "zod";

// Input schema for updating tenant default thresholds
export const updateTenantDefaultThresholdsInputSchema = z.object({
  criticalThreshold: z
    .number({ required_error: "Critical threshold is required" })
    .int("Critical threshold must be an integer")
    .positive("Critical threshold must be greater than 0"),
  attentionThreshold: z
    .number({ required_error: "Attention threshold is required" })
    .int("Attention threshold must be an integer")
    .positive("Attention threshold must be greater than 0"),
}).refine(
  (data) => data.criticalThreshold < data.attentionThreshold,
  {
    message: "Critical threshold must be less than attention threshold",
    path: ["criticalThreshold"],
  }
);

export type UpdateTenantDefaultThresholdsInput = z.infer<typeof updateTenantDefaultThresholdsInputSchema>;

// Output schema for tenant default thresholds
export const tenantDefaultThresholdsOutputSchema = z.object({
  criticalThreshold: z.number().int().positive(),
  attentionThreshold: z.number().int().positive(),
});

export type TenantDefaultThresholdsOutput = z.infer<typeof tenantDefaultThresholdsOutputSchema>;
