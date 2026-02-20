import { describe, expect, it } from "vitest";
import {
  classifyAlertLevel,
  resolveEffectiveThresholds,
} from "~/server/services/alert-service";

describe("classifyAlertLevel", () => {
  describe("boundary conditions", () => {
    it("returns red when stock <= criticalThreshold", () => {
      expect(classifyAlertLevel(0, 50, 100)).toBe("red");
      expect(classifyAlertLevel(25, 50, 100)).toBe("red");
      expect(classifyAlertLevel(50, 50, 100)).toBe("red");
    });

    it("returns orange when criticalThreshold < stock <= attentionThreshold", () => {
      expect(classifyAlertLevel(51, 50, 100)).toBe("orange");
      expect(classifyAlertLevel(75, 50, 100)).toBe("orange");
      expect(classifyAlertLevel(100, 50, 100)).toBe("orange");
    });

    it("returns green when stock > attentionThreshold", () => {
      expect(classifyAlertLevel(101, 50, 100)).toBe("green");
      expect(classifyAlertLevel(200, 50, 100)).toBe("green");
      expect(classifyAlertLevel(1000, 50, 100)).toBe("green");
    });
  });

  describe("edge cases", () => {
    it("handles zero stock correctly", () => {
      expect(classifyAlertLevel(0, 1, 10)).toBe("red");
    });

    it("handles thresholds of 1", () => {
      expect(classifyAlertLevel(0, 1, 2)).toBe("red");
      expect(classifyAlertLevel(1, 1, 2)).toBe("red");
      expect(classifyAlertLevel(2, 1, 2)).toBe("orange");
      expect(classifyAlertLevel(3, 1, 2)).toBe("green");
    });

    it("handles large threshold values", () => {
      expect(classifyAlertLevel(999999, 1000000, 2000000)).toBe("red");
      expect(classifyAlertLevel(1500000, 1000000, 2000000)).toBe("orange");
      expect(classifyAlertLevel(3000000, 1000000, 2000000)).toBe("green");
    });
  });
});

describe("resolveEffectiveThresholds", () => {
  const defaultTenantThresholds = {
    defaultCriticalThreshold: 50,
    defaultAttentionThreshold: 100,
  };

  describe("custom thresholds", () => {
    it("returns custom thresholds when both are valid", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 25,
        customAttentionThreshold: 75,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("custom");
      expect(result.criticalThreshold).toBe(25);
      expect(result.attentionThreshold).toBe(75);
    });

    it("returns custom thresholds when they equal tenant defaults", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 50,
        customAttentionThreshold: 100,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("custom");
    });
  });

  describe("defaults fallback", () => {
    it("returns defaults when custom thresholds are null", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: null,
        customAttentionThreshold: null,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
      expect(result.criticalThreshold).toBe(50);
      expect(result.attentionThreshold).toBe(100);
    });

    it("returns defaults when only critical is set", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 25,
        customAttentionThreshold: null,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when only attention is set", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: null,
        customAttentionThreshold: 75,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when critical >= attention", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 100,
        customAttentionThreshold: 100,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when critical > attention", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 150,
        customAttentionThreshold: 100,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when critical is zero", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 0,
        customAttentionThreshold: 100,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when attention is zero", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 50,
        customAttentionThreshold: 0,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when thresholds are negative", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: -10,
        customAttentionThreshold: 100,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });

    it("returns defaults when thresholds are not integers", () => {
      const product = {
        quantity: 75,
        customCriticalThreshold: 25.5,
        customAttentionThreshold: 75.5,
      };

      const result = resolveEffectiveThresholds(product, defaultTenantThresholds);

      expect(result.mode).toBe("defaults");
    });
  });
});
