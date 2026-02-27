import { describe, it, expect } from "vitest";
import {
  findDuplicateBarcodesInRows,
  productImportSchema,
} from "~/server/services/product-import-service";

describe("CSV Product Import Validation", () => {
  describe("Valid rows", () => {
    it("should accept valid product data", () => {
      const validRow = {
        name: "Test Product",
        category: "Test Category",
        unit: "pcs",
        price: "10.00",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it("should accept valid product with optional barcode", () => {
      const validRow = {
        name: "Test Product",
        category: "Test Category",
        unit: "pcs",
        price: "10.00",
        barcode: "123456789",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it("should accept zero price", () => {
      const validRow = {
        name: "Free Product",
        category: "Category",
        unit: "pcs",
        price: "0",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });
  });

  describe("Invalid rows - missing required fields", () => {
    it("should reject missing name", () => {
      const invalidRow = {
        name: "",
        category: "Category",
        unit: "pcs",
        price: "10.00",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject missing category", () => {
      const invalidRow = {
        name: "Product",
        category: "",
        unit: "pcs",
        price: "10.00",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject missing unit", () => {
      const invalidRow = {
        name: "Product",
        category: "Category",
        unit: "",
        price: "10.00",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject missing price", () => {
      const invalidRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe("Invalid rows - validation errors", () => {
    it("should reject name exceeding max length", () => {
      const invalidRow = {
        name: "A".repeat(256),
        category: "Category",
        unit: "pcs",
        price: "10.00",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject negative price", () => {
      const invalidRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "-10.00",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject non-numeric price", () => {
      const invalidRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "abc",
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should reject barcode exceeding max length", () => {
      const invalidRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "10.00",
        barcode: "B".repeat(101),
      };

      const result = productImportSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should trim whitespace from fields", () => {
      const validRow = {
        name: "  Product  ",
        category: "  Category  ",
        unit: "  pcs  ",
        price: "  10.00  ",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it("should accept empty barcode as undefined", () => {
      const validRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "10.00",
        barcode: "",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it("should handle decimal prices", () => {
      const validRow = {
        name: "Product",
        category: "Category",
        unit: "pcs",
        price: "99.99",
      };

      const result = productImportSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });
  });

  describe("Barcode duplicate detection", () => {
    it("should detect duplicate barcodes in CSV rows", () => {
      const rows = [
        { barcode: "ABC-123" },
        { barcode: "XYZ-999" },
        { barcode: "ABC-123" },
      ];

      const duplicates = findDuplicateBarcodesInRows(rows);

      expect(duplicates.has("ABC-123")).toBe(true);
      expect(duplicates.has("XYZ-999")).toBe(false);
    });

    it("should ignore empty barcodes", () => {
      const rows = [
        { barcode: "" },
        { barcode: "   " },
        { barcode: undefined },
      ];

      const duplicates = findDuplicateBarcodesInRows(rows);

      expect(duplicates.size).toBe(0);
    });
  });
});
