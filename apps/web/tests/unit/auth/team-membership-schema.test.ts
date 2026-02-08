import { describe, expect, it } from "vitest";

import {
  listTenantMembersOutputSchema,
  removeTenantMemberInputSchema,
  tenantRoleSchema,
  updateTenantMemberRoleInputSchema,
} from "~/schemas/team-membership";

describe("team membership schemas", () => {
  it("accepts valid tenant role values", () => {
    expect(tenantRoleSchema.safeParse("Admin").success).toBe(true);
    expect(tenantRoleSchema.safeParse("Manager").success).toBe(true);
    expect(tenantRoleSchema.safeParse("Operator").success).toBe(true);
    expect(tenantRoleSchema.safeParse("Owner").success).toBe(false);
  });

  it("validates role update input", () => {
    const valid = updateTenantMemberRoleInputSchema.safeParse({
      memberUserId: "user-1",
      role: "Manager",
    });

    expect(valid.success).toBe(true);

    const invalid = updateTenantMemberRoleInputSchema.safeParse({
      memberUserId: "",
      role: "Manager",
    });

    expect(invalid.success).toBe(false);
  });

  it("requires a confirmation token on step 2 self-removal", () => {
    const missingToken = removeTenantMemberInputSchema.safeParse({
      memberUserId: "user-1",
      confirmStep: 2,
    });

    const withToken = removeTenantMemberInputSchema.safeParse({
      memberUserId: "user-1",
      confirmStep: 2,
      confirmToken: "abc123",
    });

    expect(missingToken.success).toBe(false);
    expect(withToken.success).toBe(true);
  });

  it("validates list output DTO contract", () => {
    const result = listTenantMembersOutputSchema.safeParse({
      actorRole: "Admin",
      members: [
        {
          userId: "user-1",
          email: "admin@example.com",
          name: "Admin",
          role: "Admin",
          joinedAt: "2026-02-08T14:30:00.000Z",
          isCurrentUser: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
