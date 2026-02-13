import { describe, it, expect } from "vitest";
import { productInputSchema } from "~/schemas/products";

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
});
