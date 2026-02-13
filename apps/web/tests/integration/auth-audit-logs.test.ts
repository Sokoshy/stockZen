import { describe, it, expect, beforeAll } from "vitest";

import {
  createTenantWithAdmin,
  createUserWithMembership,
  getTestDb,
  cleanupTestData,
} from "../helpers/tenant-test-factories";
import { setupTestTRPCContext } from "../helpers/trpc-test-context";
import { appRouter } from "~/server/api/root";
import { auditEvents } from "~/server/db/schema";

describe("Auth Audit Logs", () => {
  beforeAll(async () => {
    await cleanupTestData();
  });

  describe("Audit Event Creation", () => {
    it("should create audit event on successful login", async () => {
      // Create test tenant and admin
      const { admin, tenant, password } = await createTenantWithAdmin("audit-login-test");
      const db = await getTestDb();

      // Perform login
      const caller = appRouter.createCaller(await setupTestTRPCContext({ db }));
      const result = await caller.auth.login({
        email: admin.email,
        password,
        rememberMe: false,
      });

      expect(result.success).toBe(true);

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "login"),
            eq(events.actorUserId, admin.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
      expect(auditEvents[0]?.actionType).toBe("login");
    });

    it("should create audit event on failed login", async () => {
      const { admin, tenant } = await createTenantWithAdmin("audit-failed-login-test");
      const db = await getTestDb();

      // Attempt login with wrong password
      const caller = appRouter.createCaller(await setupTestTRPCContext({ db }));
      
      await expect(
        caller.auth.login({
          email: admin.email,
          password: "wrongpassword123",
          rememberMe: false,
        })
      ).rejects.toThrow(/invalid/i);

      // Check audit event was created for failed login
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq }) => eq(events.actionType, "login_failed"),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("failure");
    });

    it("should create audit event on logout", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-logout-test");
      const db = await getTestDb();

      // Perform logout with authenticated session
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const result = await caller.auth.logout();
      expect(result.success).toBe(true);

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "logout"),
            eq(events.actorUserId, admin.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
    });

    it("should create audit event on role change", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-role-change-test");
      const { user: member } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "member-role-change",
      });
      const db = await getTestDb();

      // Perform role change
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const result = await caller.auth.updateTenantMemberRole({
        memberUserId: member.id,
        role: "Manager",
      });

      expect(result.success).toBe(true);
      expect(result.role).toBe("Manager");

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "role_changed"),
            eq(events.actorUserId, admin.id),
            eq(events.targetId, member.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
      const context = JSON.parse(auditEvents[0]?.context ?? "{}");
      expect(context.previousRole).toBe("Operator");
      expect(context.nextRole).toBe("Manager");
    });

    it("should create audit event on member removal", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-remove-member-test");
      const { user: member } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "member-remove",
      });
      const db = await getTestDb();

      // Perform member removal
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const result = await caller.auth.removeTenantMember({
        memberUserId: member.id,
      });

      expect(result.success).toBe(true);

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "member_removed"),
            eq(events.actorUserId, admin.id),
            eq(events.targetId, member.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
    });

    it("should create audit event on invitation creation", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-invite-create-test");
      const db = await getTestDb();

      // Create invitation
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const result = await caller.auth.createInvitation({
        email: `audit-invite-${Date.now()}@example.com`,
        role: "Operator",
      });

      expect(result.success).toBe(true);

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "invite_created"),
            eq(events.actorUserId, admin.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
    });

    it("should create audit event on invitation revocation", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-invite-revoke-test");
      const db = await getTestDb();

      // Create invitation first
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const inviteResult = await caller.auth.createInvitation({
        email: `audit-revoke-${Date.now()}@example.com`,
        role: "Operator",
      });

      expect(inviteResult.success).toBe(true);

      // Revoke invitation
      if (!inviteResult.invitation) {
        throw new Error("Expected invitation to be created");
      }
      const revokeResult = await caller.auth.revokeInvitation({
        invitationId: inviteResult.invitation.id,
      });

      expect(revokeResult.success).toBe(true);

      // Check audit event was created
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "invite_revoked"),
            eq(events.actorUserId, admin.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("success");
    });
  });

  describe("Audit Event Access Control", () => {
    it("should allow Admin to list audit events", async () => {
      const { tenant, sessionToken } = await createTenantWithAdmin("audit-list-admin-test");
      const db = await getTestDb();

      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );
      
      const result = await caller.auth.listAuditEvents({ limit: 10 });

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should forbid Manager from listing audit events", async () => {
      const { tenant } = await createTenantWithAdmin("audit-list-manager-test");
      const { sessionToken: managerToken } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Manager",
        emailPrefix: "manager-audit",
      });
      const db = await getTestDb();

      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: managerToken, tenantId: tenant.id })
      );
      
      await expect(
        caller.auth.listAuditEvents({ limit: 10 })
      ).rejects.toThrow(/forbidden|admin/i);
    });

    it("should forbid Operator from listing audit events", async () => {
      const { tenant } = await createTenantWithAdmin("audit-list-operator-test");
      const { sessionToken: operatorToken } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "operator-audit",
      });
      const db = await getTestDb();

      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: operatorToken, tenantId: tenant.id })
      );
      
      await expect(
        caller.auth.listAuditEvents({ limit: 10 })
      ).rejects.toThrow(/forbidden|admin/i);
    });
  });

  describe("Audit Event Pagination & Ordering", () => {
    it("should return audit events newest-first", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-ordering-test");
      const db = await getTestDb();

      const baseTime = Date.now() - 30_000;
      await db.insert(auditEvents).values([
        {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actionType: "login",
          status: "success",
          createdAt: new Date(baseTime + 1_000),
        },
        {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actionType: "logout",
          status: "success",
          createdAt: new Date(baseTime + 2_000),
        },
        {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actionType: "invite_created",
          status: "success",
          createdAt: new Date(baseTime + 3_000),
        },
      ]);

      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );

      const result = await caller.auth.listAuditEvents({ limit: 10 });
      const timestamps = result.events.map((event) => new Date(event.createdAt).getTime());

      expect(timestamps.length).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < timestamps.length; index += 1) {
        expect(timestamps[index - 1]).toBeGreaterThanOrEqual(timestamps[index] ?? Number.MIN_SAFE_INTEGER);
      }
    });

    it("should paginate audit events with stable cursor and no overlap", async () => {
      const { admin, tenant, sessionToken } = await createTenantWithAdmin("audit-pagination-test");
      const db = await getTestDb();

      const baseTime = Date.now() - 120_000;
      await db.insert(auditEvents).values(
        Array.from({ length: 12 }).map((_, index) => ({
          tenantId: tenant.id,
          actorUserId: admin.id,
          actionType: "login" as const,
          status: "success" as const,
          context: JSON.stringify({ index }),
          createdAt: new Date(baseTime + index * 1_000),
        }))
      );

      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken, tenantId: tenant.id })
      );

      const firstPage = await caller.auth.listAuditEvents({ limit: 5 });
      expect(firstPage.events).toHaveLength(5);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await caller.auth.listAuditEvents({
        limit: 5,
        cursor: firstPage.nextCursor ?? undefined,
      });
      expect(secondPage.events).toHaveLength(5);

      const firstPageIds = new Set(firstPage.events.map((event) => event.id));
      const overlap = secondPage.events.some((event) => firstPageIds.has(event.id));
      expect(overlap).toBe(false);

      const firstPageLast = firstPage.events[firstPage.events.length - 1];
      const secondPageFirst = secondPage.events[0];
      expect(firstPageLast).toBeDefined();
      expect(secondPageFirst).toBeDefined();

      if (firstPageLast && secondPageFirst) {
        expect(new Date(secondPageFirst.createdAt).getTime()).toBeLessThanOrEqual(
          new Date(firstPageLast.createdAt).getTime()
        );
      }
    });
  });

  describe("Tenant Isolation", () => {
    it("should not expose audit events from other tenants", async () => {
      // Create two separate tenants
      const { tenant: tenantA, sessionToken: tokenA } = await createTenantWithAdmin("audit-iso-a");
      const { tenant: tenantB, sessionToken: tokenB } = await createTenantWithAdmin("audit-iso-b");
      const db = await getTestDb();

      // Create event in tenant A
      const callerA = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: tokenA, tenantId: tenantA.id })
      );
      await callerA.auth.createInvitation({
        email: `isolated-${Date.now()}@example.com`,
        role: "Operator",
      });

      // Query events from tenant B
      const callerB = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: tokenB, tenantId: tenantB.id })
      );
      const result = await callerB.auth.listAuditEvents({ limit: 100 });

      // Should not see tenant A's events
      const hasTenantAEvents = result.events.some(
        (event) => event.tenantId === tenantA.id
      );
      expect(hasTenantAEvents).toBe(false);
    });
  });

  describe("Forbidden Attempt Audit Events", () => {
    it("should create audit event on forbidden role update attempt", async () => {
      const { tenant } = await createTenantWithAdmin("audit-forbidden-role-test");
      const { user: operator, sessionToken: operatorToken } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "operator-forbidden",
      });
      const { user: victim } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "victim-forbidden",
      });
      const db = await getTestDb();

      // Operator tries to change role (should fail)
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: operatorToken, tenantId: tenant.id })
      );
      
      await expect(
        caller.auth.updateTenantMemberRole({
          memberUserId: victim.id,
          role: "Manager",
        })
      ).rejects.toThrow(/only admins/i);

      // Check audit event was created for forbidden attempt
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "forbidden_attempt"),
            eq(events.actorUserId, operator.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("failure");
    });

    it("should create audit event on forbidden member removal attempt", async () => {
      const { tenant } = await createTenantWithAdmin("audit-forbidden-remove-test");
      const { user: operator, sessionToken: operatorToken } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "operator-remove",
      });
      const { user: victim } = await createUserWithMembership({
        tenantId: tenant.id,
        role: "Operator",
        emailPrefix: "victim-remove",
      });
      const db = await getTestDb();

      // Operator tries to remove member (should fail)
      const caller = appRouter.createCaller(
        await setupTestTRPCContext({ db, sessionToken: operatorToken, tenantId: tenant.id })
      );
      
      await expect(
        caller.auth.removeTenantMember({
          memberUserId: victim.id,
        })
      ).rejects.toThrow(/only admins/i);

      // Check audit event was created for forbidden attempt
      const auditEvents = await db.query.auditEvents.findMany({
        where: (events, { eq, and }) =>
          and(
            eq(events.tenantId, tenant.id),
            eq(events.actionType, "forbidden_attempt"),
            eq(events.actorUserId, operator.id)
          ),
      });

      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      expect(auditEvents[0]?.status).toBe("failure");
    });
  });
});
