import { describe, it, expect } from "vitest";
import { stockMovementSchema, type StockMovementInput } from "~/schemas/stock-movements";

describe("stockMovementSchema", () => {
  const validMovement: StockMovementInput = {
    productId: "prod-123",
    type: "entry",
    quantity: 10,
  };

  describe("productId validation", () => {
    it("should accept valid productId", () => {
      const result = stockMovementSchema.safeParse(validMovement);
      expect(result.success).toBe(true);
    });

    it("should reject empty productId", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        productId: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toContain("productId");
      }
    });

    it("should reject missing productId", () => {
      const result = stockMovementSchema.safeParse({
        type: "entry",
        quantity: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("type validation", () => {
    it("should accept 'entry' type", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        type: "entry",
      });
      expect(result.success).toBe(true);
    });

    it("should accept 'exit' type", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        type: "exit",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid type", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        type: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing type", () => {
      const result = stockMovementSchema.safeParse({
        productId: "prod-123",
        quantity: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("quantity validation", () => {
    it("should accept valid positive quantity", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        quantity: 10,
      });
      expect(result.success).toBe(true);
    });

    it("should reject zero quantity", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        quantity: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toContain("quantity");
        expect(result.error.errors[0]?.message).toContain("greater than 0");
      }
    });

    it("should reject negative quantity", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        quantity: -5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toContain("quantity");
      }
    });

    it("should reject non-integer quantity", () => {
      const result = stockMovementSchema.safeParse({
        ...validMovement,
        quantity: 10.5,
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing quantity", () => {
      const result = stockMovementSchema.safeParse({
        productId: "prod-123",
        type: "entry",
      });
      expect(result.success).toBe(false);
    });
  });
});
