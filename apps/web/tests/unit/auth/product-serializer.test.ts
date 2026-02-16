import { describe, it, expect } from "vitest";
import {
  serializeProductForRole,
  serializeProductsForRole,
  sanitizeProductInputForRole,
} from "~/server/auth/product-serializer";
import type { Product } from "~/server/db/schema";

describe("product-serializer", () => {
  const mockProduct: Product = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenantId: "550e8400-e29b-41d4-a716-446655440001",
    name: "Test Product",
    description: "A test product",
    sku: "TEST-001",
    category: "Electronics",
    unit: "pcs",
    barcode: "123456789",
    price: "99.99",
    purchasePrice: "50.00",
    quantity: 100,
    lowStockThreshold: 10,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  };

  describe("serializeProductForRole", () => {
    it("should include purchasePrice for Admin", () => {
      const result = serializeProductForRole(mockProduct, "Admin");
      expect(result).toHaveProperty("purchasePrice");
      if (!("purchasePrice" in result)) {
        throw new Error("Expected purchasePrice in Admin response");
      }
      expect(result.purchasePrice).toBe(50);
    });

    it("should include purchasePrice for Manager", () => {
      const result = serializeProductForRole(mockProduct, "Manager");
      expect(result).toHaveProperty("purchasePrice");
      if (!("purchasePrice" in result)) {
        throw new Error("Expected purchasePrice in Manager response");
      }
      expect(result.purchasePrice).toBe(50);
    });

    it("should NOT include purchasePrice for Operator", () => {
      const result = serializeProductForRole(mockProduct, "Operator");
      expect(result).not.toHaveProperty("purchasePrice");
    });

    it("should include all other fields regardless of role", () => {
      const adminResult = serializeProductForRole(mockProduct, "Admin");
      const operatorResult = serializeProductForRole(mockProduct, "Operator");

      const commonFields = [
        "id",
        "tenantId",
        "name",
        "description",
        "sku",
        "price",
        "quantity",
        "lowStockThreshold",
        "createdAt",
        "updatedAt",
      ];

      commonFields.forEach((field) => {
        expect(adminResult).toHaveProperty(field);
        expect(operatorResult).toHaveProperty(field);
      });
    });

    it("should handle null purchasePrice", () => {
      const productWithoutPurchasePrice: Product = {
        ...mockProduct,
        purchasePrice: null,
      };
      const result = serializeProductForRole(productWithoutPurchasePrice, "Admin");
      expect(result).toHaveProperty("purchasePrice");
      if (!("purchasePrice" in result)) {
        throw new Error("Expected purchasePrice in Admin response");
      }
      expect(result.purchasePrice).toBeNull();
    });
  });

  describe("serializeProductsForRole", () => {
    it("should serialize multiple products for Operators without purchasePrice", () => {
      const products = [mockProduct, { ...mockProduct, id: "different-id" }];
      const results = serializeProductsForRole(products, "Operator");

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result).not.toHaveProperty("purchasePrice");
      });
    });

    it("should serialize multiple products for Admin with purchasePrice", () => {
      const products = [mockProduct, { ...mockProduct, id: "different-id" }];
      const results = serializeProductsForRole(products, "Admin");

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result).toHaveProperty("purchasePrice");
      });
    });
  });

  describe("sanitizeProductInputForRole", () => {
    it("should keep purchasePrice for Admin", () => {
      const input = { name: "Test", purchasePrice: 50 };
      const result = sanitizeProductInputForRole(input, "Admin") as typeof input;
      expect(result).toHaveProperty("purchasePrice");
      expect(result.purchasePrice).toBe(50);
    });

    it("should keep purchasePrice for Manager", () => {
      const input = { name: "Test", purchasePrice: 50 };
      const result = sanitizeProductInputForRole(input, "Manager") as typeof input;
      expect(result).toHaveProperty("purchasePrice");
      expect(result.purchasePrice).toBe(50);
    });

    it("should remove purchasePrice for Operator", () => {
      const input = { name: "Test", purchasePrice: 50 };
      const result = sanitizeProductInputForRole(input, "Operator");
      expect(result).not.toHaveProperty("purchasePrice");
    });

    it("should preserve other fields when sanitizing", () => {
      const input = { name: "Test", price: 100, quantity: 10, purchasePrice: 50 };
      const result = sanitizeProductInputForRole(input, "Operator") as typeof input;
      expect(result.name).toBe("Test");
      expect(result.price).toBe(100);
      expect(result.quantity).toBe(10);
      expect(result).not.toHaveProperty("purchasePrice");
    });

    it("should handle input without purchasePrice field", () => {
      const input = { name: "Test", price: 100 };
      const result = sanitizeProductInputForRole({ purchasePrice: undefined, ...input }, "Operator") as Record<string, unknown>;
      expect(result.name).toBe("Test");
      expect(result.price).toBe(100);
    });
  });
});
