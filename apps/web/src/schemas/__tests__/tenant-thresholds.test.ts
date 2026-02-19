import { describe, it, expect } from "vitest";
import {
  updateTenantDefaultThresholdsInputSchema,
  tenantDefaultThresholdsOutputSchema,
} from "~/schemas/tenant-thresholds";

describe("tenant-thresholds schemas", () => {
  describe("updateTenantDefaultThresholdsInputSchema", () => {
    it("should accept valid thresholds", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative critical threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: -10,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("greater than 0");
      }
    });

    it("should reject zero critical threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 0,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("greater than 0");
      }
    });

    it("should reject negative attention threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50,
        attentionThreshold: -10,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("greater than 0");
      }
    });

    it("should reject zero attention threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50,
        attentionThreshold: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("greater than 0");
      }
    });

    it("should reject equal thresholds", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 100,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("less than attention threshold");
      }
    });

    it("should reject inverted thresholds (critical > attention)", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 200,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("less than attention threshold");
      }
    });

    it("should reject non-integer critical threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50.5,
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("integer");
      }
    });

    it("should reject non-integer attention threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50,
        attentionThreshold: 100.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("integer");
      }
    });

    it("should reject missing critical threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        attentionThreshold: 100,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("required");
      }
    });

    it("should reject missing attention threshold", () => {
      const result = updateTenantDefaultThresholdsInputSchema.safeParse({
        criticalThreshold: 50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("required");
      }
    });
  });

  describe("tenantDefaultThresholdsOutputSchema", () => {
    it("should validate positive integer thresholds", () => {
      const result = tenantDefaultThresholdsOutputSchema.safeParse({
        criticalThreshold: 25,
        attentionThreshold: 75,
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative critical threshold", () => {
      const result = tenantDefaultThresholdsOutputSchema.safeParse({
        criticalThreshold: -10,
        attentionThreshold: 75,
      });
      expect(result.success).toBe(false);
    });

    it("should reject zero attention threshold", () => {
      const result = tenantDefaultThresholdsOutputSchema.safeParse({
        criticalThreshold: 25,
        attentionThreshold: 0,
      });
      expect(result.success).toBe(false);
    });
  });
});
