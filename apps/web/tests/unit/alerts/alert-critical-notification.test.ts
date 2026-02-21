import { describe, expect, it } from "vitest";
import { shouldTriggerCriticalNotification } from "~/server/services/alert-service";
import type { AlertLevel } from "~/schemas/alerts";

describe("shouldTriggerCriticalNotification", () => {
  describe("non-red to red transitions", () => {
    it("returns true when transitioning from null to red", () => {
      expect(shouldTriggerCriticalNotification(null, "red")).toBe(true);
    });

    it("returns true when transitioning from green to red", () => {
      expect(shouldTriggerCriticalNotification("green", "red")).toBe(true);
    });

    it("returns true when transitioning from orange to red", () => {
      expect(shouldTriggerCriticalNotification("orange", "red")).toBe(true);
    });
  });

  describe("red to red (no transition)", () => {
    it("returns false when transitioning from red to red", () => {
      expect(shouldTriggerCriticalNotification("red", "red")).toBe(false);
    });
  });

  describe("non-red transitions", () => {
    it("returns false when new level is green", () => {
      const previousLevels: (AlertLevel | null)[] = [null, "green", "orange", "red"];
      previousLevels.forEach((prev) => {
        expect(shouldTriggerCriticalNotification(prev, "green")).toBe(false);
      });
    });

    it("returns false when new level is orange", () => {
      const previousLevels: (AlertLevel | null)[] = [null, "green", "orange", "red"];
      previousLevels.forEach((prev) => {
        expect(shouldTriggerCriticalNotification(prev, "orange")).toBe(false);
      });
    });
  });

  describe("edge cases", () => {
    it("returns false for green to green", () => {
      expect(shouldTriggerCriticalNotification("green", "green")).toBe(false);
    });

    it("returns false for orange to orange", () => {
      expect(shouldTriggerCriticalNotification("orange", "orange")).toBe(false);
    });

    it("returns false for green to orange", () => {
      expect(shouldTriggerCriticalNotification("green", "orange")).toBe(false);
    });

    it("returns false for orange to green", () => {
      expect(shouldTriggerCriticalNotification("orange", "green")).toBe(false);
    });

    it("returns false for red to green", () => {
      expect(shouldTriggerCriticalNotification("red", "green")).toBe(false);
    });

    it("returns false for red to orange", () => {
      expect(shouldTriggerCriticalNotification("red", "orange")).toBe(false);
    });
  });
});
