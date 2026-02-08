import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canManageTenantMembers,
  createSelfRemovalConfirmToken,
  isAdminRole,
  requiresSessionInvalidationForRoleChange,
  validateMemberRemovalPolicy,
  validateRoleChangePolicy,
  verifySelfRemovalConfirmToken,
} from "~/server/auth/rbac-policy";

describe("team membership policy helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recognizes Admin role as manager-capable", () => {
    expect(isAdminRole("Admin")).toBe(true);
    expect(canManageTenantMembers("Admin")).toBe(true);
    expect(canManageTenantMembers("Manager")).toBe(false);
    expect(canManageTenantMembers("Operator")).toBe(false);
  });

  it("blocks last admin self-demotion", () => {
    const result = validateRoleChangePolicy({
      actorUserId: "user-1",
      targetUserId: "user-1",
      currentRole: "Admin",
      nextRole: "Manager",
      adminCount: 1,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Last Admin");
  });

  it("allows role change when tenant still has another admin", () => {
    const result = validateRoleChangePolicy({
      actorUserId: "user-1",
      targetUserId: "user-1",
      currentRole: "Admin",
      nextRole: "Manager",
      adminCount: 2,
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks removing last admin membership", () => {
    const result = validateMemberRemovalPolicy({
      actorUserId: "user-1",
      targetUserId: "user-1",
      targetRole: "Admin",
      adminCount: 1,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Last Admin");
  });

  it("requires session invalidation only for Admin downgrades", () => {
    expect(requiresSessionInvalidationForRoleChange("Admin", "Manager")).toBe(true);
    expect(requiresSessionInvalidationForRoleChange("Admin", "Operator")).toBe(true);
    expect(requiresSessionInvalidationForRoleChange("Manager", "Operator")).toBe(false);
    expect(requiresSessionInvalidationForRoleChange("Manager", "Manager")).toBe(false);
  });

  it("creates and verifies a valid self-removal confirmation token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));

    const token = createSelfRemovalConfirmToken({
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(
      verifySelfRemovalConfirmToken({ token, tenantId: "tenant-1", userId: "user-1" })
    ).toBe(true);
    expect(
      verifySelfRemovalConfirmToken({ token, tenantId: "tenant-2", userId: "user-1" })
    ).toBe(false);
  });

  it("rejects expired self-removal confirmation tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));

    const token = createSelfRemovalConfirmToken({
      tenantId: "tenant-1",
      userId: "user-1",
    });

    vi.setSystemTime(new Date("2026-02-01T10:11:00.000Z"));

    expect(
      verifySelfRemovalConfirmToken({ token, tenantId: "tenant-1", userId: "user-1" })
    ).toBe(false);
  });
});
