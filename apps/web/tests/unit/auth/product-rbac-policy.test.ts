import { describe, expect, it } from "vitest";

import { canViewPurchasePrice, canWritePurchasePrice } from "~/server/auth/rbac-policy";

describe("product RBAC policy", () => {
  it("allows Admin and Manager to view purchase price", () => {
    expect(canViewPurchasePrice("Admin")).toBe(true);
    expect(canViewPurchasePrice("Manager")).toBe(true);
    expect(canViewPurchasePrice("Operator")).toBe(false);
  });

  it("allows Admin and Manager to write purchase price", () => {
    expect(canWritePurchasePrice("Admin")).toBe(true);
    expect(canWritePurchasePrice("Manager")).toBe(true);
    expect(canWritePurchasePrice("Operator")).toBe(false);
  });
});
