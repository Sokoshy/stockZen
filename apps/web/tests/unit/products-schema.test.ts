import { describe, it, expect } from "vitest";
import { productInputSchema, productUpdateDataSchema } from "~/schemas/products";

describe("productInputSchema validation", () => {
  describe("required fields", () => {
    it("should reject product without name", () => {
      const result = productInputSchema.safeParse({
        category: "Electronics",
        unit: "pcs",
        price: 99.99,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes("name"))).toBe(true);
      }
    });

    it("should reject product without price", () => {
      const result = productInputSchema.safeParse({
        name: "Test",
        category: "Electronics",
        unit: "pcs",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes("price"))).toBe(true);
      }
    });
  });

  describe("field constraints", () => {
    it("should reject negative price", () => {
      const result = productInputSchema.safeParse({
        name: "Test",
        category: "Electronics",
        unit: "pcs",
        price: -10,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty name", () => {
      const result = productInputSchema.safeParse({
        name: "",
        category: "Electronics",
        unit: "pcs",
        price: 10,
      });
      expect(result.success).toBe(false);
    });

    it("should reject name exceeding max length", () => {
      const result = productInputSchema.safeParse({
        name: "a".repeat(256),
        category: "Electronics",
        unit: "pcs",
        price: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("should accept product with only required fields", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        category: "Electronics",
        unit: "pcs",
        price: 99.99,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Test Product");
        expect(result.data.category).toBe("Electronics");
        expect(result.data.unit).toBe("pcs");
        expect(result.data.price).toBe(99.99);
      }
    });

    it("should accept product without optional category/unit", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all optional fields", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        description: "A test product",
        sku: "TEST-001",
        category: "Electronics",
        unit: "pcs",
        barcode: "123456789",
        price: 99.99,
        purchasePrice: 50.00,
        quantity: 100,
        lowStockThreshold: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe("A test product");
        expect(result.data.sku).toBe("TEST-001");
        expect(result.data.barcode).toBe("123456789");
        expect(result.data.purchasePrice).toBe(50.00);
        expect(result.data.quantity).toBe(100);
        expect(result.data.lowStockThreshold).toBe(10);
      }
    });

    it("should accept null values for nullable fields", () => {
      const result = productInputSchema.safeParse({
        name: "Test",
        category: "A",
        unit: "pcs",
        price: 10,
        description: null,
        sku: null,
        barcode: null,
        purchasePrice: null,
      });
      expect(result.success).toBe(true);
    });

  });

  describe("threshold mode validation", () => {
    it("should accept defaults mode without custom thresholds", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "defaults",
      });
      expect(result.success).toBe(true);
    });

    it("should accept custom mode with valid custom thresholds", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: 25,
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customCriticalThreshold).toBe(25);
        expect(result.data.customAttentionThreshold).toBe(50);
      }
    });

    it("should reject custom mode without customCriticalThreshold", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes("customCriticalThreshold"))).toBe(true);
      }
    });

    it("should reject custom mode without customAttentionThreshold", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: 25,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes("customAttentionThreshold"))).toBe(true);
      }
    });

    it("should reject custom mode when critical >= attention", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: 50,
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes("customCriticalThreshold"))).toBe(true);
      }
    });

    it("should reject custom mode when critical > attention", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: 75,
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative custom thresholds", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: -10,
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should reject zero custom thresholds", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "custom",
        customCriticalThreshold: 0,
        customAttentionThreshold: 50,
      });
      expect(result.success).toBe(false);
    });

    it("should accept null custom thresholds in defaults mode", () => {
      const result = productInputSchema.safeParse({
        name: "Test Product",
        price: 99.99,
        thresholdMode: "defaults",
        customCriticalThreshold: null,
        customAttentionThreshold: null,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("productUpdateDataSchema validation", () => {
  it("rejects custom threshold updates without thresholdMode", () => {
    const result = productUpdateDataSchema.safeParse({
      customCriticalThreshold: 25,
      customAttentionThreshold: 50,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("thresholdMode"))).toBe(true);
    }
  });

  it("rejects custom mode when one threshold is missing", () => {
    const result = productUpdateDataSchema.safeParse({
      thresholdMode: "custom",
      customCriticalThreshold: 25,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("customAttentionThreshold"))
      ).toBe(true);
    }
  });

  it("accepts defaults mode with explicit null custom thresholds", () => {
    const result = productUpdateDataSchema.safeParse({
      thresholdMode: "defaults",
      customCriticalThreshold: null,
      customAttentionThreshold: null,
    });

    expect(result.success).toBe(true);
  });
});
