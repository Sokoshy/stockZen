import { describe, it, expect } from "vitest";
import { calculatePMI } from "~/server/services/dashboard-service";

describe("calculatePMI", () => {
  describe("edge cases", () => {
    it("should return 100 when there are 0 products", () => {
      expect(calculatePMI(0, 0, 0)).toBe(100);
    });

    it("should return 100 when there are no red or orange alerts", () => {
      expect(calculatePMI(10, 0, 0)).toBe(100);
    });
  });

  describe("single alert level scenarios", () => {
    it("should return 60 when all products have red alerts (100% red)", () => {
      expect(calculatePMI(10, 10, 0)).toBe(60);
    });

    it("should return 85 when all products have orange alerts (100% orange)", () => {
      expect(calculatePMI(10, 0, 10)).toBe(85);
    });

    it("should return 0 when red alerts exceed calculation bounds", () => {
      expect(calculatePMI(1, 10, 0)).toBe(0);
    });
  });

  describe("mixed alert distributions", () => {
    it("should calculate PMI correctly with 50% red and 50% orange", () => {
      const result = calculatePMI(10, 5, 5);
      expect(result).toBe(73);
    });

    it("should calculate PMI correctly with 25% red and 25% orange", () => {
      const result = calculatePMI(100, 25, 25);
      expect(result).toBe(86);
    });

    it("should calculate PMI correctly with 10% red and 20% orange", () => {
      const result = calculatePMI(100, 10, 20);
      expect(result).toBe(93);
    });
  });

  describe("small counts", () => {
    it("should handle very small product counts", () => {
      expect(calculatePMI(1, 0, 0)).toBe(100);
      expect(calculatePMI(1, 1, 0)).toBe(60);
      expect(calculatePMI(1, 0, 1)).toBe(85);
    });
  });

  describe("clamping", () => {
    it("should clamp result to 0 minimum", () => {
      const result = calculatePMI(1, 100, 0);
      expect(result).toBe(0);
    });

    it("should clamp result to 100 maximum", () => {
      const result = calculatePMI(100, 0, 0);
      expect(result).toBe(100);
    });
  });
});
