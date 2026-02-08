// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { session, tenantMemberships, user } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

function extractSessionCookie(setCookieHeader: string): string {
  const sessionPart = setCookieHeader
    .split(";")
    .find((part) => part.trim().startsWith("__session="));

  if (!sessionPart) {
    throw new Error("Expected __session cookie in Set-Cookie header");
  }

  return sessionPart.trim();
}

let ipSequence = 50;
function nextIp(): string {
  ipSequence += 1;
  return `127.0.20.${ipSequence}`;
}

async function createProtectedCaller(cookie: string, clientIp: string) {
  const headers = new Headers({
    cookie,
    "x-forwarded-for": clientIp,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const ctx = await createTRPCContext({ headers });
  return {
    ctx,
    caller: createCaller(ctx),
  };
}

describe("Auth team membership management", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    ipSequence += 20;
  });

  async function signUpUser() {
    const email = generateTestEmail();
    const password = "Password123";
    const tenantName = generateTestTenantName();
    const signUpIp = nextIp();
    const signUpCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": signUpIp }),
    });
    const signUpCaller = createCaller(signUpCtx);

    const signUpResult = await signUpCaller.auth.signUp({
      email,
      password,
      confirmPassword: password,
      tenantName,
    });

    if (!signUpResult.user?.id || !signUpResult.tenant?.id) {
      throw new Error("Expected sign-up to return user and tenant IDs");
    }

    await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

    const loginIp = nextIp();
    const loginCtx = await createTRPCContext({
      headers: new Headers({ "x-forwarded-for": loginIp }),
    });
    const loginCaller = createCaller(loginCtx);
    await loginCaller.auth.login({
      email,
      password,
      rememberMe: false,
    });

    const setCookie = loginCtx.responseHeaders.get("set-cookie");
    if (!setCookie) {
      throw new Error("Expected login response to include session cookie");
    }

    return {
      userId: signUpResult.user.id,
      tenantId: signUpResult.tenant.id,
      email,
      cookie: extractSessionCookie(setCookie),
      ip: loginIp,
    };
  }

  async function addExistingUserToTenantWithRole(input: {
    tenantId: string;
    role: "Admin" | "Manager" | "Operator";
  }) {
    const created = await signUpUser();

    await testDb.insert(tenantMemberships).values({
      tenantId: input.tenantId,
      userId: created.userId,
      role: input.role,
    });

    await testDb
      .update(user)
      .set({ defaultTenantId: input.tenantId })
      .where(eq(user.id, created.userId));

    return created;
  }

  it("allows Admin to list/update/remove members while preserving access to other tenant memberships", async () => {
    const admin = await signUpUser();
    const outsider = await signUpUser();
    const manager = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Manager",
    });

    const { caller: adminCaller } = await createProtectedCaller(admin.cookie, admin.ip);

    const membersList = await adminCaller.auth.listTenantMembers();
    const listedUserIds = membersList.members.map((member) => member.userId);

    expect(membersList.actorRole).toBe("Admin");
    expect(listedUserIds).toContain(admin.userId);
    expect(listedUserIds).toContain(manager.userId);
    expect(listedUserIds).not.toContain(outsider.userId);

    const roleUpdateResult = await adminCaller.auth.updateTenantMemberRole({
      memberUserId: manager.userId,
      role: "Operator",
    });

    expect(roleUpdateResult.success).toBe(true);
    expect(roleUpdateResult.role).toBe("Operator");

    const updatedMembership = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, admin.tenantId),
        eq(tenantMemberships.userId, manager.userId)
      ),
    });

    expect(updatedMembership?.role).toBe("Operator");

    const removeResult = await adminCaller.auth.removeTenantMember({
      memberUserId: manager.userId,
      confirmStep: 1,
    });

    expect(removeResult.success).toBe(true);
    expect(removeResult.requiresSecondConfirmation).toBe(false);

    const removedMembership = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, admin.tenantId),
        eq(tenantMemberships.userId, manager.userId)
      ),
    });
    expect(removedMembership).toBeUndefined();

    const targetSessions = await testDb.query.session.findMany({
      where: eq(session.userId, manager.userId),
    });
    expect(targetSessions.length).toBeGreaterThan(0);

    const { caller: removedCaller } = await createProtectedCaller(manager.cookie, manager.ip);
    const membershipsAfterRemoval = await removedCaller.auth.getTenantMemberships();

    expect(membershipsAfterRemoval.some((membership) => membership.tenantId === admin.tenantId)).toBe(false);
    expect(membershipsAfterRemoval.some((membership) => membership.tenantId === manager.tenantId)).toBe(
      true
    );
  });

  it("rejects cross-tenant role updates and removals", async () => {
    const adminA = await signUpUser();
    const adminB = await signUpUser();

    const { caller: adminACaller } = await createProtectedCaller(adminA.cookie, adminA.ip);

    await expect(
      adminACaller.auth.updateTenantMemberRole({
        memberUserId: adminB.userId,
        role: "Manager",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      adminACaller.auth.removeTenantMember({
        memberUserId: adminB.userId,
        confirmStep: 1,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const untouchedMembership = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, adminB.tenantId),
        eq(tenantMemberships.userId, adminB.userId)
      ),
    });

    expect(untouchedMembership?.role).toBe("Admin");
    expect(untouchedMembership).toBeDefined();
  });

  it("returns forbidden for Manager and Operator when attempting role updates or removals", async () => {
    const admin = await signUpUser();
    const manager = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Manager",
    });
    const operator = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Operator",
    });

    const { caller: managerCaller } = await createProtectedCaller(manager.cookie, manager.ip);
    const { caller: operatorCaller } = await createProtectedCaller(operator.cookie, operator.ip);

    await expect(
      managerCaller.auth.updateTenantMemberRole({
        memberUserId: operator.userId,
        role: "Manager",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      managerCaller.auth.removeTenantMember({
        memberUserId: operator.userId,
        confirmStep: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      operatorCaller.auth.updateTenantMemberRole({
        memberUserId: manager.userId,
        role: "Operator",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      operatorCaller.auth.removeTenantMember({
        memberUserId: manager.userId,
        confirmStep: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks last Admin self-demotion and self-removal", async () => {
    const soleAdmin = await signUpUser();
    const { caller: adminCaller } = await createProtectedCaller(soleAdmin.cookie, soleAdmin.ip);

    await expect(
      adminCaller.auth.updateTenantMemberRole({
        memberUserId: soleAdmin.userId,
        role: "Manager",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      adminCaller.auth.removeTenantMember({
        memberUserId: soleAdmin.userId,
        confirmStep: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const existingMembership = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, soleAdmin.tenantId),
        eq(tenantMemberships.userId, soleAdmin.userId)
      ),
    });

    expect(existingMembership?.role).toBe("Admin");
  });

  it("requires double confirmation for self-removal and invalidates access after confirmation", async () => {
    const adminA = await signUpUser();
    await addExistingUserToTenantWithRole({ tenantId: adminA.tenantId, role: "Admin" });

    const { caller: adminCaller } = await createProtectedCaller(adminA.cookie, adminA.ip);

    const firstAttempt = await adminCaller.auth.removeTenantMember({
      memberUserId: adminA.userId,
      confirmStep: 1,
    });

    expect(firstAttempt.success).toBe(false);
    expect(firstAttempt.requiresSecondConfirmation).toBe(true);
    expect(firstAttempt.confirmToken).toBeTruthy();

    const membershipBeforeConfirm = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, adminA.tenantId),
        eq(tenantMemberships.userId, adminA.userId)
      ),
    });
    expect(membershipBeforeConfirm).toBeDefined();

    const secondAttempt = await adminCaller.auth.removeTenantMember({
      memberUserId: adminA.userId,
      confirmStep: 2,
      confirmToken: firstAttempt.confirmToken,
    });

    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.requiresSecondConfirmation).toBe(false);

    const membershipAfterConfirm = await testDb.query.tenantMemberships.findFirst({
      where: and(
        eq(tenantMemberships.tenantId, adminA.tenantId),
        eq(tenantMemberships.userId, adminA.userId)
      ),
    });
    expect(membershipAfterConfirm).toBeUndefined();

    const sessionsAfterRemoval = await testDb.query.session.findMany({
      where: eq(session.userId, adminA.userId),
    });
    expect(sessionsAfterRemoval).toHaveLength(0);

    const { caller: blockedCaller } = await createProtectedCaller(adminA.cookie, adminA.ip);
    await expect(blockedCaller.auth.getTenantMemberships()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("applies admin downgrade immediately without broad session revocation", async () => {
    const adminA = await signUpUser();
    const adminB = await addExistingUserToTenantWithRole({
      tenantId: adminA.tenantId,
      role: "Admin",
    });

    const { caller: adminBCaller } = await createProtectedCaller(adminB.cookie, adminB.ip);

    await adminBCaller.auth.updateTenantMemberRole({
      memberUserId: adminA.userId,
      role: "Manager",
    });

    const adminASessions = await testDb.query.session.findMany({
      where: eq(session.userId, adminA.userId),
    });
    expect(adminASessions.length).toBeGreaterThan(0);

    const { caller: downgradedAdminACaller } = await createProtectedCaller(adminA.cookie, adminA.ip);

    const memberships = await downgradedAdminACaller.auth.getTenantMemberships();
    const currentTenantMembership = memberships.find((membership) => membership.tenantId === adminA.tenantId);

    expect(currentTenantMembership?.role).toBe("Manager");

    await expect(
      downgradedAdminACaller.auth.updateTenantMemberRole({
        memberUserId: adminB.userId,
        role: "Operator",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
