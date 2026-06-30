import { TRPCError } from "@trpc/server";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  canManageTenantMembers,
  createSelfRemovalConfirmToken,
  validateMemberRemovalPolicy,
  validateRoleChangePolicy,
  verifySelfRemovalConfirmToken,
} from "~/server/auth/rbac-policy";
import { tenantMemberships, user } from "~/server/db/schema";
import type * as schema from "~/server/db/schema";
import { globallyInvalidateAllUserSessions } from "~/server/lib/session-lifecycle";
import { logger } from "~/server/logger";
import { createAuditEvent } from "~/server/services/audit-service";
import type { TenantRole } from "~/schemas/team-membership";

type DbClient = PostgresJsDatabase<typeof schema>;

async function countTenantAdmins(input: {
  tenantId: string;
  db: { query: DbClient["query"] };
}) {
  const adminMemberships = await input.db.query.tenantMemberships.findMany({
    columns: {
      userId: true,
    },
    where: and(eq(tenantMemberships.tenantId, input.tenantId), eq(tenantMemberships.role, "Admin")),
  });

  return adminMemberships.length;
}

async function lockTenantMembershipsForUpdate(input: {
  tenantId: string;
  db: { execute: DbClient["execute"] };
}) {
  await input.db.execute(sql`
    select ${tenantMemberships.id}
    from ${tenantMemberships}
    where ${tenantMemberships.tenantId} = ${input.tenantId}
    for update
  `);
}

function assertTenantHasAdminOrThrow(adminCount: number) {
  if (adminCount < 1) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant must always retain at least one Admin.",
    });
  }
}

export const membershipService = {
  async listTenantMembers(db: DbClient, tenantId: string, actorRole: TenantRole, actorUserId: string) {
    const memberships = await db.query.tenantMemberships.findMany({
      columns: {
        userId: true,
        role: true,
        createdAt: true,
      },
      where: eq(tenantMemberships.tenantId, tenantId),
      with: {
        user: {
          columns: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return {
      actorRole,
      members: memberships.map((membership) => ({
        userId: membership.userId,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
        isCurrentUser: membership.userId === actorUserId,
      })),
    };
  },

  async updateMemberRole(
    db: DbClient,
    tenantId: string,
    actorUserId: string,
    actorRole: TenantRole,
    input: { memberUserId: string; role: TenantRole },
  ) {
    type RoleUpdateTransactionResult =
      | { forbidden: true; auditData: Omit<Parameters<typeof createAuditEvent>[0], "db"> }
      | { targetUserId: string; previousRole: TenantRole; nextRole: TenantRole; roleChanged: boolean };

    const mutationResult = await db.transaction(async (tx) => {
      await lockTenantMembershipsForUpdate({ tenantId, db: tx });

      const actorMembershipInTx = await tx.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, actorUserId),
        ),
      });

      if (!actorMembershipInTx || !canManageTenantMembers(actorMembershipInTx.role)) {
        logger.warn(
          {
            event: "audit.auth.team_member.role_update.forbidden",
            actorUserId,
            tenantId,
            actorRole: actorMembershipInTx?.role,
            targetUserId: input.memberUserId,
            targetRole: input.role,
          },
          "Forbidden role update attempt"
        );

        return {
          forbidden: true as const,
          auditData: {
            tenantId,
            actorUserId,
            actionType: "forbidden_attempt" as const,
            targetType: "user",
            targetId: input.memberUserId,
            status: "failure" as const,
            context: JSON.stringify({
              action: "role_update",
              actorRole: actorMembershipInTx?.role,
              requestedRole: input.role,
            }),
          },
        };
      }

      const targetMembership = await tx.query.tenantMemberships.findFirst({
        columns: {
          tenantId: true,
          userId: true,
          role: true,
        },
        where: and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, input.memberUserId)
        ),
      });

      if (!targetMembership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found in this tenant.",
        });
      }

      const adminCount = await countTenantAdmins({ tenantId, db: tx });
      const policyResult = validateRoleChangePolicy({
        actorUserId,
        targetUserId: targetMembership.userId,
        currentRole: targetMembership.role,
        nextRole: input.role as TenantRole,
        adminCount,
      });

      if (!policyResult.allowed) {
        logger.warn(
          {
            event: "audit.auth.team_member.role_update.blocked",
            actorUserId,
            tenantId,
            targetUserId: input.memberUserId,
            currentRole: targetMembership.role,
            requestedRole: input.role,
            reason: policyResult.reason,
          },
          "Blocked role update request"
        );

        throw new TRPCError({
          code: "FORBIDDEN",
          message: policyResult.reason ?? "Role transition is not allowed.",
        });
      }

      if (targetMembership.role === input.role) {
        return {
          targetUserId: targetMembership.userId,
          previousRole: targetMembership.role,
          nextRole: input.role as TenantRole,
          roleChanged: false,
        };
      }

      await tx
        .update(tenantMemberships)
        .set({ role: input.role })
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.userId, targetMembership.userId)
          )
        );

      const adminCountAfterUpdate = await countTenantAdmins({ tenantId, db: tx });
      assertTenantHasAdminOrThrow(adminCountAfterUpdate);

      return {
        targetUserId: targetMembership.userId,
        previousRole: targetMembership.role,
        nextRole: input.role as TenantRole,
        roleChanged: true,
      };
    });

    if (mutationResult.forbidden) {
      await createAuditEvent({ db, ...mutationResult.auditData });
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only Admins can change member roles.",
      });
    }

    if (mutationResult.roleChanged) {
      logger.info(
        {
          event: "audit.auth.team_member.role_update.success",
          actorUserId,
          tenantId,
          targetUserId: mutationResult.targetUserId,
          previousRole: mutationResult.previousRole,
          nextRole: mutationResult.nextRole,
        },
        "Member role updated"
      );

      await createAuditEvent({
        db,
        tenantId,
        actorUserId,
        actionType: "role_changed",
        targetType: "user",
        targetId: mutationResult.targetUserId,
        status: "success",
        context: JSON.stringify({
          previousRole: mutationResult.previousRole,
          nextRole: mutationResult.nextRole,
        }),
      });
    }

    return {
      success: true,
      message: "Member role updated successfully.",
      memberUserId: mutationResult.targetUserId,
      role: input.role,
    };
  },

  async removeMember(
    db: DbClient,
    tenantId: string,
    actorUserId: string,
    actorRole: TenantRole,
    input: { memberUserId: string; confirmStep: number; confirmToken?: string | undefined },
  ) {
    const targetMembership = await db.query.tenantMemberships.findFirst({
      columns: {
        tenantId: true,
        userId: true,
        role: true,
      },
      where: and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, input.memberUserId)
      ),
    });

    if (!targetMembership) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Member not found in this tenant.",
      });
    }

    const adminCount = await countTenantAdmins({ tenantId, db });
    const policyResult = validateMemberRemovalPolicy({
      actorUserId,
      targetUserId: targetMembership.userId,
      targetRole: targetMembership.role,
      adminCount,
    });

    if (!policyResult.allowed) {
      logger.warn(
        {
          event: "audit.auth.team_member.remove.blocked",
          actorUserId,
          tenantId,
          targetUserId: targetMembership.userId,
          targetRole: targetMembership.role,
          reason: policyResult.reason,
        },
        "Blocked member removal request"
      );

      throw new TRPCError({
        code: "FORBIDDEN",
        message: policyResult.reason ?? "Member removal is not allowed.",
      });
    }

    const isSelfRemoval = targetMembership.userId === actorUserId;

    if (isSelfRemoval) {
      const hasValidConfirmation =
        input.confirmStep === 2 &&
        typeof input.confirmToken === "string" &&
        verifySelfRemovalConfirmToken({
          token: input.confirmToken,
          tenantId,
          userId: targetMembership.userId,
        });

      if (!hasValidConfirmation) {
        const confirmToken = createSelfRemovalConfirmToken({
          tenantId,
          userId: targetMembership.userId,
        });

        logger.info(
          {
            event: "audit.auth.team_member.self_removal.confirmation_requested",
            actorUserId,
            tenantId,
          },
          "Self-removal confirmation requested"
        );

        return {
          success: false,
          message: "Confirm self-removal one more time to continue.",
          requiresSecondConfirmation: true,
          confirmToken,
          memberUserId: targetMembership.userId,
        };
      }
    }

    type MemberRemovalTransactionResult =
      | { forbidden: true; auditData: Omit<Parameters<typeof createAuditEvent>[0], "db"> }
      | { targetUserId: string; targetRole: TenantRole; sessionsInvalidated: boolean };

    const removalResult = await db.transaction(async (tx) => {
      await lockTenantMembershipsForUpdate({ tenantId, db: tx });

      const actorMembershipInTx = await tx.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, actorUserId),
        ),
      });

      if (!actorMembershipInTx || !canManageTenantMembers(actorMembershipInTx.role)) {
        logger.warn(
          {
            event: "audit.auth.team_member.remove.forbidden",
            actorUserId,
            tenantId,
            actorRole: actorMembershipInTx?.role,
            targetUserId: input.memberUserId,
          },
          "Forbidden member removal attempt"
        );

        return {
          forbidden: true as const,
          auditData: {
            tenantId,
            actorUserId,
            actionType: "forbidden_attempt" as const,
            targetType: "user",
            targetId: input.memberUserId,
            status: "failure" as const,
            context: JSON.stringify({
              action: "member_remove",
              actorRole: actorMembershipInTx?.role,
            }),
          },
        };
      }

      const targetMembershipInTx = await tx.query.tenantMemberships.findFirst({
        columns: {
          tenantId: true,
          userId: true,
          role: true,
        },
        where: and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, input.memberUserId)
        ),
      });

      if (!targetMembershipInTx) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found in this tenant.",
        });
      }

      const adminCountInTx = await countTenantAdmins({ tenantId, db: tx });
      const policyResultInTx = validateMemberRemovalPolicy({
        actorUserId,
        targetUserId: targetMembershipInTx.userId,
        targetRole: targetMembershipInTx.role,
        adminCount: adminCountInTx,
      });

      if (!policyResultInTx.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: policyResultInTx.reason ?? "Member removal is not allowed.",
        });
      }

      await tx
        .delete(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.userId, targetMembershipInTx.userId)
          )
        );

      const fallbackMembership = await tx.query.tenantMemberships.findFirst({
        columns: {
          tenantId: true,
        },
        where: eq(tenantMemberships.userId, targetMembershipInTx.userId),
      });

      await tx
        .update(user)
        .set({ defaultTenantId: fallbackMembership?.tenantId ?? null })
        .where(and(eq(user.id, targetMembershipInTx.userId), eq(user.defaultTenantId, tenantId)));

      const shouldInvalidateSessions = isSelfRemoval || !fallbackMembership;

      if (shouldInvalidateSessions) {
        await globallyInvalidateAllUserSessions(tx, targetMembershipInTx.userId);
      }

      const adminCountAfterRemoval = await countTenantAdmins({ tenantId, db: tx });
      assertTenantHasAdminOrThrow(adminCountAfterRemoval);

      return {
        targetUserId: targetMembershipInTx.userId,
        targetRole: targetMembershipInTx.role,
        sessionsInvalidated: shouldInvalidateSessions,
      };
    });

    if (removalResult.forbidden) {
      await createAuditEvent({ db, ...removalResult.auditData });
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only Admins can remove members.",
      });
    }

    logger.info(
      {
        event: isSelfRemoval
          ? "audit.auth.team_member.self_removal.confirmed"
          : "audit.auth.team_member.remove.success",
        actorUserId,
        tenantId,
        targetUserId: removalResult.targetUserId,
        targetRole: removalResult.targetRole,
        sessionsInvalidated: removalResult.sessionsInvalidated,
      },
      "Member removed from tenant"
    );

    await createAuditEvent({
      db,
      tenantId,
      actorUserId,
      actionType: "member_removed",
      targetType: "user",
      targetId: removalResult.targetUserId,
      status: "success",
      context: JSON.stringify({
        targetRole: removalResult.targetRole,
        isSelfRemoval,
        sessionsInvalidated: removalResult.sessionsInvalidated,
      }),
    });

    return {
      success: true,
      message: isSelfRemoval
        ? "You have been removed from this tenant."
        : "Member removed successfully.",
      requiresSecondConfirmation: false,
      memberUserId: removalResult.targetUserId,
    };
  },

  async listAuditEvents(
    db: DbClient,
    tenantId: string,
    input: { cursor?: { createdAt: string; id: string }; limit?: number },
  ) {
    const limit = input.limit ?? 20;
    const cursor = input.cursor;
    const cursorCreatedAt = cursor ? new Date(cursor.createdAt) : null;

    const events = await db.query.auditEvents.findMany({
      where: cursor && cursorCreatedAt
        ? (auditEvents, { and, eq, lt }) =>
            and(
              eq(auditEvents.tenantId, tenantId),
              or(
                lt(auditEvents.createdAt, cursorCreatedAt),
                and(eq(auditEvents.createdAt, cursorCreatedAt), lt(auditEvents.id, cursor.id))
              )
            )
        : (auditEvents, { eq }) => eq(auditEvents.tenantId, tenantId),
      orderBy: (auditEvents, { desc }) => [desc(auditEvents.createdAt), desc(auditEvents.id)],
      limit: limit + 1,
    });

    let nextCursor: { createdAt: string; id: string } | null = null;
    if (events.length > limit) {
      const nextEvent = events[limit - 1];
      if (nextEvent) {
        nextCursor = {
          createdAt: nextEvent.createdAt.toISOString(),
          id: nextEvent.id,
        };
      }
      events.pop();
    }

    return {
      events: events.map((event) => ({
        id: event.id,
        tenantId: event.tenantId,
        actorUserId: event.actorUserId,
        actionType: event.actionType,
        targetType: event.targetType,
        targetId: event.targetId,
        status: event.status,
        context: event.context,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor,
    };
  },
};
