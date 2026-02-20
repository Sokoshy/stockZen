import { describe, expect, it } from "vitest";
import {
  isAlertSnoozed,
  calculateSnoozeExpiry,
  shouldCancelSnoozeOnWorsening,
  SNOOZE_DURATION_HOURS,
} from "~/server/services/alert-service";
import type { AlertLevel } from "~/schemas/alerts";

describe("isAlertSnoozed", () => {
  it("returns false when snoozedUntil is null", () => {
    const now = new Date("2026-02-20T12:00:00Z");
    expect(isAlertSnoozed(null, now)).toBe(false);
  });

  it("returns false when snoozedUntil is in the past", () => {
    const now = new Date("2026-02-20T12:00:00Z");
    const past = new Date("2026-02-20T10:00:00Z");
    expect(isAlertSnoozed(past, now)).toBe(false);
  });

  it("returns true when snoozedUntil is in the future", () => {
    const now = new Date("2026-02-20T12:00:00Z");
    const future = new Date("2026-02-20T20:00:00Z");
    expect(isAlertSnoozed(future, now)).toBe(true);
  });

  it("returns false when snoozedUntil equals now (boundary)", () => {
    const now = new Date("2026-02-20T12:00:00Z");
    expect(isAlertSnoozed(now, now)).toBe(false);
  });

  it("returns true when snoozedUntil is 1ms in the future", () => {
    const now = new Date("2026-02-20T12:00:00.000Z");
    const future = new Date("2026-02-20T12:00:00.001Z");
    expect(isAlertSnoozed(future, now)).toBe(true);
  });
});

describe("calculateSnoozeExpiry", () => {
  it("returns a date 8 hours in the future", () => {
    const now = new Date("2026-02-20T12:00:00Z");
    const expiry = calculateSnoozeExpiry(now);

    expect(expiry.getTime() - now.getTime()).toBe(SNOOZE_DURATION_HOURS * 60 * 60 * 1000);
  });

  it("returns correct expiry for midnight", () => {
    const now = new Date("2026-02-20T00:00:00Z");
    const expiry = calculateSnoozeExpiry(now);

    expect(expiry.toISOString()).toBe("2026-02-20T08:00:00.000Z");
  });

  it("returns correct expiry crossing day boundary", () => {
    const now = new Date("2026-02-20T20:00:00Z");
    const expiry = calculateSnoozeExpiry(now);

    expect(expiry.toISOString()).toBe("2026-02-21T04:00:00.000Z");
  });

  it("returns correct expiry for end of month", () => {
    const now = new Date("2026-02-28T20:00:00Z");
    const expiry = calculateSnoozeExpiry(now);

    expect(expiry.toISOString()).toBe("2026-03-01T04:00:00.000Z");
  });
});

describe("shouldCancelSnoozeOnWorsening", () => {
  it("returns true when level worsens from orange to red", () => {
    expect(shouldCancelSnoozeOnWorsening("orange", "red")).toBe(true);
  });

  it("returns false when level stays orange", () => {
    expect(shouldCancelSnoozeOnWorsening("orange", "orange")).toBe(false);
  });

  it("returns false when level stays red", () => {
    expect(shouldCancelSnoozeOnWorsening("red", "red")).toBe(false);
  });

  it("returns false when level improves from red to orange", () => {
    expect(shouldCancelSnoozeOnWorsening("red", "orange")).toBe(false);
  });

  it("returns false when level improves from orange to green", () => {
    expect(shouldCancelSnoozeOnWorsening("orange", "green")).toBe(false);
  });

  it("returns false when level improves from red to green", () => {
    expect(shouldCancelSnoozeOnWorsening("red", "green")).toBe(false);
  });

  it("returns false when starting from green", () => {
    expect(shouldCancelSnoozeOnWorsening("green", "red")).toBe(false);
    expect(shouldCancelSnoozeOnWorsening("green", "orange")).toBe(false);
    expect(shouldCancelSnoozeOnWorsening("green", "green")).toBe(false);
  });
});

describe("triage state transitions", () => {
  describe("snooze visibility logic", () => {
    it("alert should be visible when not snoozed", () => {
      const now = new Date("2026-02-20T12:00:00Z");
      const isSnoozed = isAlertSnoozed(null, now);
      expect(isSnoozed).toBe(false);
    });

    it("alert should be hidden when snoozed and not expired", () => {
      const now = new Date("2026-02-20T12:00:00Z");
      const snoozedUntil = calculateSnoozeExpiry(now);
      const isSnoozed = isAlertSnoozed(snoozedUntil, now);
      expect(isSnoozed).toBe(true);
    });

    it("alert should be visible when snooze expired", () => {
      const snoozedUntil = new Date("2026-02-20T10:00:00Z");
      const now = new Date("2026-02-20T12:00:00Z");
      const isSnoozed = isAlertSnoozed(snoozedUntil, now);
      expect(isSnoozed).toBe(false);
    });
  });

  describe("worsening scenario", () => {
    it("snooze should cancel when orange alert becomes red", () => {
      const currentLevel: AlertLevel = "orange";
      const newLevel: AlertLevel = "red";
      const shouldCancel = shouldCancelSnoozeOnWorsening(currentLevel, newLevel);
      expect(shouldCancel).toBe(true);
    });

    it("snooze should not cancel when red alert stays red", () => {
      const currentLevel: AlertLevel = "red";
      const newLevel: AlertLevel = "red";
      const shouldCancel = shouldCancelSnoozeOnWorsening(currentLevel, newLevel);
      expect(shouldCancel).toBe(false);
    });
  });
});

describe("SNOOZE_DURATION_HOURS constant", () => {
  it("should be exactly 8 hours", () => {
    expect(SNOOZE_DURATION_HOURS).toBe(8);
  });
});
