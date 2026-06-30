import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { auth } from "~/server/better-auth";
import { queueInvitationEmail } from "~/server/better-auth/invitation-email";
import { setInvitationTokenContext, setTenantContext } from "~/server/db/rls";
import { tenantInvitations, tenantMemberships, tenants, user } from "~/server/db/schema";
import type * as schema from "~/server/db/schema";
import { logger } from "~/server/logger";
import { getClientIp } from "~/server/rate-limit";
import { createAuditEvent } from "~/server/services/audit-service";
import { BILLING_UPGRADE_ROUTE, checkUserLimit, lockTenantSubscription } from "~/server/services/subscription-service";

type DbClient = PostgresJsDatabase<typeof schema>;

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorWithCode = error as { code?: string };
  return errorWithCode.code === "23505";
}

export const invitationService = {
  async createInvitation(
    db: DbClient,
    tenantId: string,
    actorUserId: string,
    input: { email: string; role: "Admin" | "Manager" | "Operator" },
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();

    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    let invitation: typeof tenantInvitations.$inferSelect | undefined;
    try {
      [invitation] = await db.transaction(async (tx) => {
        await lockTenantSubscription({ db: tx, tenantId });

        const userLimitCheck = await checkUserLimit({ db: tx, tenantId });
        if (!userLimitCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `User limit reached. Your ${userLimitCheck.plan} plan allows a maximum of ${userLimitCheck.limit} users. Upgrade in Billing settings: ${BILLING_UPGRADE_ROUTE}`,
          });
        }

        const existingMembership = await tx
          .select({ userId: tenantMemberships.userId })
          .from(tenantMemberships)
          .innerJoin(user, eq(tenantMemberships.userId, user.id))
          .where(
            and(
              eq(tenantMemberships.tenantId, tenantId),
              sql`lower(${user.email}) = ${normalizedEmail}`
            )
          )
          .limit(1);

        if (existingMembership.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user is already a member of the tenant.",
          });
        }

        await tx
          .update(tenantInvitations)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              sql`lower(${tenantInvitations.email}) = ${normalizedEmail}`,
              isNull(tenantInvitations.revokedAt),
              isNull(tenantInvitations.usedAt),
              lt(tenantInvitations.expiresAt, new Date())
            )
          );

        const existingInvitation = await tx.query.tenantInvitations.findFirst({
          where: and(
            eq(tenantInvitations.tenantId, tenantId),
            sql`lower(${tenantInvitations.email}) = ${normalizedEmail}`,
            isNull(tenantInvitations.revokedAt),
            isNull(tenantInvitations.usedAt)
          ),
        });

        if (existingInvitation) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An active invitation already exists for this email.",
          });
        }

        const inserted = await tx
          .insert(tenantInvitations)
          .values({
            tenantId,
            email: normalizedEmail,
            role: input.role,
            tokenHash,
            expiresAt,
            invitedByUserId: actorUserId,
          })
          .returning();

        return inserted;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An active invitation already exists for this email.",
        });
      }

      throw error;
    }

    if (!invitation) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create invitation.",
      });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { name: true },
    });

    const invitedByUser = await db.query.user.findFirst({
      where: eq(user.id, actorUserId),
      columns: { name: true },
    });

    queueInvitationEmail({
      invitationId: invitation.id,
      email: normalizedEmail,
      token,
      tenantName: tenant?.name ?? "Your Organization",
      invitedByName: invitedByUser?.name ?? "An Admin",
      role: input.role,
    });

    logger.info(
      {
        event: "audit.auth.invitation.create.success",
        actorUserId,
        tenantId,
        invitationId: invitation.id,
        targetEmail: normalizedEmail,
        targetRole: input.role,
      },
      "Invitation created and email queued"
    );

    await createAuditEvent({
      db,
      tenantId,
      actorUserId,
      actionType: "invite_created",
      targetType: "invitation",
      targetId: invitation.id,
      status: "success",
      context: JSON.stringify({ targetEmail: normalizedEmail, targetRole: input.role }),
    });

    return {
      success: true,
      message: "Invitation created successfully.",
      invitation: {
        id: invitation.id,
        tenantId: invitation.tenantId,
        email: invitation.email,
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
        expiresAt: invitation.expiresAt.toISOString(),
        revokedAt: invitation.revokedAt?.toISOString(),
        usedAt: invitation.usedAt?.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      },
    };
  },

  async revokeInvitation(
    db: DbClient,
    tenantId: string,
    actorUserId: string,
    input: { invitationId: string },
  ) {
    const invitation = await db.transaction(async (tx) => {
      const inv = await tx.query.tenantInvitations.findFirst({
        where: and(
          eq(tenantInvitations.id, input.invitationId),
          eq(tenantInvitations.tenantId, tenantId)
        ),
      });

      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      if (inv.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation is already revoked.",
        });
      }

      if (inv.usedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation has already been used.",
        });
      }

      await tx
        .update(tenantInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(tenantInvitations.id, input.invitationId));

      return inv;
    });

    logger.info(
      {
        event: "audit.auth.invitation.revoke.success",
        actorUserId,
        tenantId,
        invitationId: input.invitationId,
        targetEmail: invitation.email,
      },
      "Invitation revoked successfully"
    );

    await createAuditEvent({
      db,
      tenantId,
      actorUserId,
      actionType: "invite_revoked",
      targetType: "invitation",
      targetId: input.invitationId,
      status: "success",
      context: JSON.stringify({ targetEmail: invitation.email }),
    });

    return {
      success: true,
      message: "Invitation revoked successfully.",
    };
  },

  async listInvitations(db: DbClient, tenantId: string) {
    const invitations = await db.query.tenantInvitations.findMany({
      where: eq(tenantInvitations.tenantId, tenantId),
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    });

    return {
      invitations: invitations.map((inv) => ({
        id: inv.id,
        tenantId: inv.tenantId,
        email: inv.email,
        role: inv.role,
        invitedByUserId: inv.invitedByUserId,
        expiresAt: inv.expiresAt.toISOString(),
        revokedAt: inv.revokedAt?.toISOString(),
        usedAt: inv.usedAt?.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
    };
  },

  async previewInvitation(
    db: DbClient,
    token: string,
    tokenHash: string,
    headers: Headers,
  ) {
    const clientIp = getClientIp(headers);
    return db.transaction(async (tx) => {
      await setInvitationTokenContext(tokenHash, tx);

      const invitation = await tx.query.tenantInvitations.findFirst({
        where: eq(tenantInvitations.tokenHash, tokenHash),
      });

      if (!invitation) {
        logger.warn(
          {
            event: "audit.auth.invitation.preview.rejected",
            reason: "invalid_or_missing",
            clientIp,
          },
          "Invitation preview rejected"
        );
        return {
          valid: false,
          state: "invalid_or_expired" as const,
          message:
            "This invitation is no longer valid. Please request a new invitation from an Admin.",
        };
      }

      if (invitation.usedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
        const reason = invitation.usedAt ? "used" : invitation.revokedAt ? "revoked" : "expired";
        logger.info(
          {
            event: "audit.auth.invitation.preview.rejected",
            reason,
            invitationId: invitation.id,
            clientIp,
          },
          "Invitation preview rejected"
        );
        return {
          valid: false,
          state: "invalid_or_expired" as const,
          message:
            "This invitation is no longer valid. Please request a new invitation from an Admin.",
        };
      }

      return {
        valid: true,
        state: "pending" as const,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        message: "Invitation is valid. Please set your password to join.",
      };
    });
  },

  async acceptInvitation(
    db: DbClient,
    headers: Headers,
    input: { token: string; password: string; tokenHash: string },
  ) {
    const { token, password, tokenHash } = input;
    const clientIp = getClientIp(headers);
    let createdUserId: string | null = null;
    let result:
      | {
          userId: string;
          tenantId: string;
          isNewUser: boolean;
        }
      | undefined;

    const unConsumeInvitation = async (invitationId: string) => {
      try {
        await db.transaction(async (tx) => {
          await setInvitationTokenContext(tokenHash, tx);
          await tx
            .update(tenantInvitations)
            .set({ usedAt: null })
            .where(eq(tenantInvitations.id, invitationId));
        });
      } catch (cleanupError) {
        logger.error(
          {
            event: "audit.auth.invitation.accept.cleanup.failed",
            invitationId,
            reason:
              cleanupError instanceof Error
                ? cleanupError.message
                : "unknown",
          },
          "Failed to un-consume invitation after invitation accept failure"
        );
      }
    };

    const consumedInvitation = await db.transaction(async (tx) => {
      await setInvitationTokenContext(tokenHash, tx);

      const invitation = await tx.query.tenantInvitations.findFirst({
        where: eq(tenantInvitations.tokenHash, tokenHash),
      });

      if (!invitation) {
        logger.warn(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "invalid_or_missing",
            clientIp,
          },
          "Invitation accept rejected"
        );
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "This invitation link is invalid or has expired. Please request a new invitation from an Admin.",
        });
      }

      if (invitation.usedAt) {
        logger.info(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "used",
            invitationId: invitation.id,
            clientIp,
          },
          "Invitation accept rejected"
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This invitation is no longer valid. Please request a new invitation from an Admin.",
        });
      }

      if (invitation.revokedAt) {
        logger.info(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "revoked",
            invitationId: invitation.id,
            clientIp,
          },
          "Invitation accept rejected"
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This invitation is no longer valid. Please request a new invitation from an Admin.",
        });
      }

      if (invitation.expiresAt < new Date()) {
        logger.info(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "expired",
            invitationId: invitation.id,
            clientIp,
          },
          "Invitation accept rejected"
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This invitation is no longer valid. Please request a new invitation from an Admin.",
        });
      }

      const consumedAt = new Date();
      const [consumed] = await tx
        .update(tenantInvitations)
        .set({ usedAt: consumedAt })
        .where(
          and(
            eq(tenantInvitations.id, invitation.id),
            isNull(tenantInvitations.usedAt),
            isNull(tenantInvitations.revokedAt),
            gt(tenantInvitations.expiresAt, consumedAt)
          )
        )
        .returning({
          id: tenantInvitations.id,
          tenantId: tenantInvitations.tenantId,
          email: tenantInvitations.email,
          role: tenantInvitations.role,
        });

      if (!consumed) {
        logger.warn(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "already_consumed_or_invalid_state",
            invitationId: invitation.id,
            clientIp,
          },
          "Invitation accept rejected due to token race"
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This invitation has already been used. Please request a new invitation from an Admin.",
        });
      }

      return consumed;
    });

    let userId: string;
    let isNewUser: boolean;

    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, consumedInvitation.email),
    });

    if (existingUser) {
      const existingMembership = await db.query.tenantMemberships.findFirst({
        where: and(
          eq(tenantMemberships.tenantId, consumedInvitation.tenantId),
          eq(tenantMemberships.userId, existingUser.id)
        ),
      });

      if (existingMembership) {
        logger.info(
          {
            event: "audit.auth.invitation.accept.rejected",
            reason: "already_member",
            invitationId: consumedInvitation.id,
            tenantId: consumedInvitation.tenantId,
            userId: existingUser.id,
            clientIp,
          },
          "Invitation accept rejected"
        );
        await unConsumeInvitation(consumedInvitation.id);
        throw new TRPCError({
          code: "CONFLICT",
          message: "You are already a member of this tenant.",
        });
      }

      userId = existingUser.id;
      isNewUser = false;
    } else {
      const userName =
        consumedInvitation.email.split("@")[0] ?? consumedInvitation.email;
      let signUpResult: Awaited<ReturnType<typeof auth.api.signUpEmail>>;

      try {
        signUpResult = await auth.api.signUpEmail({
          body: {
            email: consumedInvitation.email,
            password,
            name: userName,
            callbackURL: "/dashboard",
          },
          headers,
        });
      } catch (signUpError) {
        await unConsumeInvitation(consumedInvitation.id);
        throw signUpError;
      }

      if (!signUpResult?.user?.id) {
        await unConsumeInvitation(consumedInvitation.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user account.",
        });
      }

      userId = signUpResult.user.id;
      createdUserId = userId;
      isNewUser = true;
    }

    try {
      await db.transaction(async (tx) => {
        await setTenantContext(consumedInvitation.tenantId, tx);

        const userLimitCheck = await checkUserLimit({
          db: tx,
          tenantId: consumedInvitation.tenantId,
        });

        if (!userLimitCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `User limit reached. The ${userLimitCheck.plan} plan allows a maximum of ${userLimitCheck.limit} users.`,
          });
        }

        const existingMembership = await tx.query.tenantMemberships.findFirst({
          where: and(
            eq(tenantMemberships.tenantId, consumedInvitation.tenantId),
            eq(tenantMemberships.userId, userId)
          ),
        });

        if (existingMembership) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You are already a member of this tenant.",
          });
        }

        await tx.insert(tenantMemberships).values({
          tenantId: consumedInvitation.tenantId,
          userId,
          role: consumedInvitation.role,
        });
        await tx
          .update(user)
          .set({ defaultTenantId: consumedInvitation.tenantId })
          .where(eq(user.id, userId));
      });
    } catch (tx2Error) {
      if (createdUserId) {
        try {
          await db.delete(user).where(eq(user.id, createdUserId));
        } catch (cleanupError) {
          logger.error(
            {
              event: "audit.auth.invitation.accept.cleanup.failed",
              userId: createdUserId,
              reason:
                cleanupError instanceof Error
                  ? cleanupError.message
                  : "unknown",
            },
            "Failed to clean up user after invitation accept failure"
          );
        }
      }
      await unConsumeInvitation(consumedInvitation.id);
      throw tx2Error;
    }

    result = { userId, tenantId: consumedInvitation.tenantId, isNewUser };

    await createAuditEvent({
      db,
      tenantId: consumedInvitation.tenantId,
      actorUserId: userId,
      actionType: "invite_accepted",
      targetType: "invitation",
      targetId: consumedInvitation.id,
      status: "success",
      context: JSON.stringify({
        role: consumedInvitation.role,
        email: consumedInvitation.email,
        isNewUser,
      }),
    });

    logger.info(
      {
        event: "audit.auth.invitation.accept.success",
        userId: result.userId,
        tenantId: result.tenantId,
        isNewUser: result.isNewUser,
        clientIp,
      },
      "Invitation accepted successfully"
    );

    return {
      success: true,
      message: "Invitation accepted successfully. You can now sign in.",
      redirectTo: "/login",
    };
  },
};
