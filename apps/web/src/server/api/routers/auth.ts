import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import {
  loginResponseSchema,
  loginSchema,
  requestPasswordResetResponseSchema,
  requestPasswordResetSchema,
  resetPasswordResponseSchema,
  resetPasswordSubmitSchema,
  signUpResponseSchema,
  signUpSchema,
} from "~/schemas/auth";
import {
  listTenantMembersOutputSchema,
  removeTenantMemberInputSchema,
  removeTenantMemberOutputSchema,
  updateTenantMemberRoleInputSchema,
  updateTenantMemberRoleOutputSchema,
} from "~/schemas/team-membership";
import {
  acceptInvitationInputSchema,
  acceptInvitationResponseSchema,
  createInvitationInputSchema,
  createInvitationResponseSchema,
  listInvitationsOutputSchema,
  previewInvitationInputSchema,
  previewInvitationResponseSchema,
  revokeInvitationInputSchema,
  revokeInvitationResponseSchema,
} from "~/schemas/tenant-invitations";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import {
  canManageTenantMembers,
  createSelfRemovalConfirmToken,
  validateMemberRemovalPolicy,
  validateRoleChangePolicy,
  verifySelfRemovalConfirmToken,
} from "~/server/auth/rbac-policy";
import { auth } from "~/server/better-auth";
import {
  getTrustedPasswordResetRedirectUrl,
} from "~/server/better-auth/password-reset-email";
import {
  queueInvitationEmail,
} from "~/server/better-auth/invitation-email";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  extractSessionToken,
} from "~/server/better-auth/session-cookie";
import {
  extractErrorMessage,
  isInvalidResetTokenError,
} from "~/server/better-auth/password-reset-errors";
import { db as rootDb } from "~/server/db";
import { setInvitationTokenContext, setTenantContext } from "~/server/db/rls";
import { session, tenantInvitations, tenantMemberships, tenants, user } from "~/server/db/schema";
import { logger } from "~/server/logger";
import { getClientIp, rateLimit } from "~/server/rate-limit";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 30;
const REMEMBER_ME_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GENERIC_LOGIN_ERROR = "Invalid email or password";
const GENERIC_PASSWORD_RESET_REQUEST_RESPONSE =
  "If this email exists in our system, check your email for the reset link";
const GENERIC_PASSWORD_RESET_TOKEN_ERROR =
  "This reset link is invalid or has expired. Please request a new reset link.";
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "Password reset successful. Please sign in with your new password.";
const PASSWORD_RESET_REQUEST_RATE_LIMIT = {
  limit: 3,
  windowMs: 15 * 60 * 1000,
} as const;
const PASSWORD_RESET_SUBMIT_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
} as const;

function splitCombinedSetCookie(setCookieHeader: string): string[] {
  return setCookieHeader
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getSessionTokenFromSetCookie(setCookie: string): string | null {
  const match = setCookie.match(/__session=([^;]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function getSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function extractSetCookieHeaders(result: unknown): string[] {
  if (!result || typeof result !== "object" || !("headers" in result)) {
    return [];
  }

  const headers = (result as { headers?: Headers }).headers;
  if (!(headers instanceof Headers)) {
    return [];
  }

  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie().filter((value) => value.length > 0);
  }

  const single = headers.get("set-cookie");
  return single ? splitCombinedSetCookie(single) : [];
}

function assertTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context is required for this operation.",
    });
  }

  return tenantId;
}

async function getCurrentTenantMembershipOrThrow(input: {
  tenantId: string;
  userId: string;
  db: Pick<typeof rootDb, "query">;
}) {
  const membership = await input.db.query.tenantMemberships.findFirst({
    columns: {
      tenantId: true,
      userId: true,
      role: true,
    },
    where: and(
      eq(tenantMemberships.tenantId, input.tenantId),
      eq(tenantMemberships.userId, input.userId)
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active tenant membership is required for this operation.",
    });
  }

  return membership;
}

async function countTenantAdmins(input: {
  tenantId: string;
  db: Pick<typeof rootDb, "query">;
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
  db: Pick<typeof rootDb, "execute">;
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

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorWithCode = error as { code?: string };
  return errorWithCode.code === "23505";
}

export const authRouter = createTRPCRouter({
  /**
   * Sign up a new user with tenant creation
   * This creates:
   * 1. A new user (via Better Auth)
   * 2. A new tenant
   * 3. A tenant membership with Admin role
   *
   * Tenant creation and membership are transactional; user creation is cleaned
   * up if any downstream step fails.
   */
  signUp: publicProcedure
    .input(signUpSchema)
    .output(signUpResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { email, password, tenantName } = input;

      const rateKey = `sign-up:${getClientIp(ctx.headers)}`;
      const rateResult = rateLimit(rateKey, { limit: 5, windowMs: 60_000 });
      if (!rateResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many sign up attempts. Please try again later.",
        });
      }

      // Check if email is already in use
      const existingUser = await ctx.db.query.user.findFirst({
        where: eq(user.email, email),
      });

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      const userName = email.split("@")[0] ?? email;
      let betterAuthResult: Awaited<ReturnType<typeof auth.api.signUpEmail>>;

      try {
        betterAuthResult = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name: userName,
            callbackURL: "/dashboard",
          },
          headers: ctx.headers,
        });
      } catch (error) {
        logger.error({ error: (error as Error).message }, "Sign up failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An error occurred during sign up. Please try again.",
        });
      }

      if (!betterAuthResult?.user?.id) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user account",
        });
      }

      try {
        // Create tenant and membership in a transaction
        const result = await ctx.db.transaction(async (tx) => {
          const [newTenant] = await tx
            .insert(tenants)
            .values({
              name: tenantName,
            })
            .returning({
              id: tenants.id,
              name: tenants.name,
            });

          if (!newTenant) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create tenant",
            });
          }

          await setTenantContext(newTenant.id, tx);

          const [membership] = await tx
            .insert(tenantMemberships)
            .values({
              tenantId: newTenant.id,
              userId: betterAuthResult.user.id,
              role: "Admin",
            })
            .returning({
              id: tenantMemberships.id,
            });

          if (!membership) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create tenant membership",
            });
          }

          await tx
            .update(user)
            .set({ defaultTenantId: newTenant.id })
            .where(eq(user.id, betterAuthResult.user.id));

          return {
            user: betterAuthResult.user,
            tenant: newTenant,
          };
        });

        const sessionInfo = extractSessionToken(betterAuthResult);
        if (sessionInfo.setCookie) {
          ctx.responseHeaders.append("Set-Cookie", sessionInfo.setCookie);
        } else if (sessionInfo.token) {
          ctx.responseHeaders.append(
            "Set-Cookie",
            buildSessionCookie({
              token: sessionInfo.token,
              expiresAt: sessionInfo.expiresAt,
            })
          );
        } else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to establish a session after sign up.",
          });
        }

        return {
          success: true,
          message: "Account created successfully",
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          },
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
          },
        };
      } catch (error) {
        try {
          await ctx.db.delete(user).where(eq(user.id, betterAuthResult.user.id));
        } catch (cleanupError) {
          logger.error(
            { error: (cleanupError as Error).message },
            "Failed to clean up user after sign up error"
          );
        }

        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({ error: (error as Error).message }, "Sign up error");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An error occurred during sign up. Please try again.",
        });
      }
    }),

  /**
   * Sign in with email and password.
   * Default session is short-lived; remember-me extends session and uses
   * persistent cookie.
   */
  login: publicProcedure
    .input(loginSchema)
    .output(loginResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { email, password, rememberMe } = input;
      const clientIp = getClientIp(ctx.headers);

      const rateKey = `login:${clientIp}`;
      const rateResult = rateLimit(rateKey, { limit: 5, windowMs: 60_000 });
      if (!rateResult.allowed) {
        logger.warn({ event: "audit.auth.login.rate_limited", clientIp }, "Login rate limit exceeded");
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many login attempts. Please try again later.",
        });
      }

      try {
        const betterAuthResult = await auth.api.signInEmail({
          body: {
            email,
            password,
            callbackURL: "/dashboard",
            rememberMe,
          },
          headers: ctx.headers,
          returnHeaders: true,
        });

        const signInResponse = betterAuthResult.response;

        if (!signInResponse?.user?.id) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: GENERIC_LOGIN_ERROR });
        }

        const dbSessionToken = signInResponse.token;

        if (!dbSessionToken) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to establish session after login.",
          });
        }

        const sessionTtl = rememberMe ? REMEMBER_ME_SESSION_TTL_SECONDS : DEFAULT_SESSION_TTL_SECONDS;
        const sessionExpiresAt = new Date(Date.now() + sessionTtl * 1000);

        if (rememberMe) {
          await ctx.db
            .update(session)
            .set({
              expiresAt: sessionExpiresAt,
              updatedAt: new Date(),
            })
            .where(eq(session.userId, signInResponse.user.id));
        }

        const userRecord = await ctx.db.query.user.findFirst({
          columns: {
            id: true,
            email: true,
            name: true,
            defaultTenantId: true,
          },
          where: eq(user.id, signInResponse.user.id),
        });

        if (!userRecord?.defaultTenantId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Tenant context is required for this account.",
          });
        }

        const setCookieHeaders = extractSetCookieHeaders(betterAuthResult);
        const cookieSessionToken =
          setCookieHeaders
            .map((headerValue) => getSessionTokenFromSetCookie(headerValue))
            .find((value): value is string => Boolean(value)) ?? null;

        if (setCookieHeaders.length > 0) {
          for (const headerValue of setCookieHeaders) {
            ctx.responseHeaders.append("Set-Cookie", headerValue);
          }
        } else {
          ctx.responseHeaders.append(
            "Set-Cookie",
            buildSessionCookie({
              token: dbSessionToken,
              expiresAt: sessionExpiresAt,
              persistent: false,
            })
          );
        }

        const persistentCookieToken = cookieSessionToken ?? dbSessionToken;

        if (rememberMe) {
          ctx.responseHeaders.append(
            "Set-Cookie",
            buildSessionCookie({
              token: persistentCookieToken,
              expiresAt: sessionExpiresAt,
              persistent: true,
            })
          );
        }

        logger.info(
          {
            event: "audit.auth.login.success",
            userId: userRecord.id,
            tenantId: userRecord.defaultTenantId,
            rememberMe,
            clientIp,
          },
          "User login succeeded"
        );

        return {
          success: true,
          message: "Login successful",
          user: {
            id: userRecord.id,
            email: userRecord.email,
            name: userRecord.name,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError && error.code !== "UNAUTHORIZED") {
          throw error;
        }

        logger.warn(
          {
            event: "audit.auth.login.failed",
            clientIp,
            reason: error instanceof Error ? error.message : "unknown",
          },
          "User login failed"
        );

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: GENERIC_LOGIN_ERROR,
        });
      }
    }),

  /**
   * Request password reset and always return a generic success response.
   */
  requestPasswordReset: publicProcedure
    .input(requestPasswordResetSchema)
    .output(requestPasswordResetResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const clientIp = getClientIp(ctx.headers);

      const rateKey = `password-reset-request:${clientIp}`;
      const rateResult = rateLimit(rateKey, PASSWORD_RESET_REQUEST_RATE_LIMIT);
      if (!rateResult.allowed) {
        logger.warn(
          {
            event: "audit.auth.password_reset.request.rate_limited",
            clientIp,
          },
          "Password reset request rate limit exceeded"
        );

        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many password reset requests. Please try again later.",
        });
      }

      try {
        await auth.api.requestPasswordReset({
          body: {
            email: input.email,
            redirectTo: getTrustedPasswordResetRedirectUrl(),
          },
          headers: ctx.headers,
        });
      } catch (error) {
        logger.error(
          {
            event: "audit.auth.password_reset.request.failed",
            clientIp,
            reason: extractErrorMessage(error),
          },
          "Password reset request failed"
        );

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to process password reset right now. Please try again.",
        });
      }

      logger.info(
        {
          event: "audit.auth.password_reset.request.accepted",
          clientIp,
        },
        "Password reset request accepted"
      );

      return {
        success: true,
        message: GENERIC_PASSWORD_RESET_REQUEST_RESPONSE,
      };
    }),

  /**
   * Reset password using one-time token.
   */
  resetPassword: publicProcedure
    .input(resetPasswordSubmitSchema)
    .output(resetPasswordResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const clientIp = getClientIp(ctx.headers);

      const rateKey = `password-reset-submit:${clientIp}`;
      const rateResult = rateLimit(rateKey, PASSWORD_RESET_SUBMIT_RATE_LIMIT);
      if (!rateResult.allowed) {
        logger.warn(
          {
            event: "audit.auth.password_reset.submit.rate_limited",
            clientIp,
          },
          "Password reset submit rate limit exceeded"
        );

        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many password reset attempts. Please try again later.",
        });
      }

      try {
        await auth.api.resetPassword({
          body: {
            token: input.token,
            newPassword: input.newPassword,
          },
          headers: ctx.headers,
        });
      } catch (error) {
        if (isInvalidResetTokenError(error)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: GENERIC_PASSWORD_RESET_TOKEN_ERROR,
          });
        }

        logger.error(
          {
            event: "audit.auth.password_reset.submit.failed",
            clientIp,
            reason: extractErrorMessage(error),
          },
          "Password reset submit failed"
        );

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to reset password right now. Please try again.",
        });
      }

      logger.info(
        {
          event: "audit.auth.password_reset.submit.success",
          clientIp,
        },
        "Password reset submit succeeded"
      );

      return {
        success: true,
        message: PASSWORD_RESET_SUCCESS_MESSAGE,
      };
    }),

  /**
   * Sign out and clear auth cookie.
   */
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const currentSession = await auth.api.getSession({ headers: ctx.headers });
    const currentToken = getSessionTokenFromCookieHeader(ctx.headers.get("cookie"));
    const sessionRecord = currentToken
      ? await ctx.db.query.session.findFirst({
          columns: { userId: true },
          where: eq(session.token, currentToken),
        })
      : null;
    const logoutUserId = currentSession?.user?.id ?? sessionRecord?.userId ?? null;

    try {
      await auth.api.signOut({
        headers: ctx.headers,
      });

      if (currentToken) {
        await ctx.db.delete(session).where(eq(session.token, currentToken));
      }
    } catch (error) {
      logger.warn(
        {
          event: "audit.auth.logout.failed",
          userId: logoutUserId,
          reason: error instanceof Error ? error.message : "unknown",
        },
        "User logout failed"
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to log out",
      });
    }

    ctx.responseHeaders.append("Set-Cookie", buildClearSessionCookie());

    logger.info(
      {
        event: "audit.auth.logout.success",
        userId: logoutUserId,
      },
      "User logged out"
    );

    return {
      success: true,
      message: "Logged out successfully",
    };
  }),

  /**
   * List all members in current tenant.
   */
  listTenantMembers: protectedProcedure
    .output(listTenantMembersOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const actorMembership = await getCurrentTenantMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      const memberships = await ctx.db.query.tenantMemberships.findMany({
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
        actorRole: actorMembership.role,
        members: memberships.map((membership) => ({
          userId: membership.userId,
          email: membership.user.email,
          name: membership.user.name,
          role: membership.role,
          joinedAt: membership.createdAt.toISOString(),
          isCurrentUser: membership.userId === ctx.session.user.id,
        })),
      };
    }),

  /**
   * Update the role for a member in current tenant.
   */
  updateTenantMemberRole: protectedProcedure
    .input(updateTenantMemberRoleInputSchema)
    .output(updateTenantMemberRoleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const mutationResult = await ctx.db.transaction(async (tx) => {
        await lockTenantMembershipsForUpdate({ tenantId, db: tx });

        const actorMembership = await getCurrentTenantMembershipOrThrow({
          tenantId,
          userId: ctx.session.user.id,
          db: tx,
        });

        if (!canManageTenantMembers(actorMembership.role)) {
          logger.warn(
            {
              event: "audit.auth.team_member.role_update.forbidden",
              actorUserId: ctx.session.user.id,
              tenantId,
              actorRole: actorMembership.role,
              targetUserId: input.memberUserId,
              targetRole: input.role,
            },
            "Forbidden role update attempt"
          );

          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only Admins can change member roles.",
          });
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
          actorUserId: ctx.session.user.id,
          targetUserId: targetMembership.userId,
          currentRole: targetMembership.role,
          nextRole: input.role,
          adminCount,
        });

        if (!policyResult.allowed) {
          logger.warn(
            {
              event: "audit.auth.team_member.role_update.blocked",
              actorUserId: ctx.session.user.id,
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
            nextRole: input.role,
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
          nextRole: input.role,
          roleChanged: true,
        };
      });

      if (mutationResult.roleChanged) {
        logger.info(
          {
            event: "audit.auth.team_member.role_update.success",
            actorUserId: ctx.session.user.id,
            tenantId,
            targetUserId: mutationResult.targetUserId,
            previousRole: mutationResult.previousRole,
            nextRole: mutationResult.nextRole,
          },
          "Member role updated"
        );
      }

      return {
        success: true,
        message: "Member role updated successfully.",
        memberUserId: mutationResult.targetUserId,
        role: input.role,
      };
    }),

  /**
   * Remove a member from current tenant.
   */
  removeTenantMember: protectedProcedure
    .input(removeTenantMemberInputSchema)
    .output(removeTenantMemberOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const actorMembership = await getCurrentTenantMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      if (!canManageTenantMembers(actorMembership.role)) {
        logger.warn(
          {
            event: "audit.auth.team_member.remove.forbidden",
            actorUserId: ctx.session.user.id,
            tenantId,
            actorRole: actorMembership.role,
            targetUserId: input.memberUserId,
          },
          "Forbidden member removal attempt"
        );

        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins can remove members.",
        });
      }

      const targetMembership = await ctx.db.query.tenantMemberships.findFirst({
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

      const adminCount = await countTenantAdmins({ tenantId, db: ctx.db });
      const policyResult = validateMemberRemovalPolicy({
        actorUserId: ctx.session.user.id,
        targetUserId: targetMembership.userId,
        targetRole: targetMembership.role,
        adminCount,
      });

      if (!policyResult.allowed) {
        logger.warn(
          {
            event: "audit.auth.team_member.remove.blocked",
            actorUserId: ctx.session.user.id,
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

      const isSelfRemoval = targetMembership.userId === ctx.session.user.id;

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
              actorUserId: ctx.session.user.id,
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

      const removalResult = await ctx.db.transaction(async (tx) => {
        await lockTenantMembershipsForUpdate({ tenantId, db: tx });

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
          actorUserId: ctx.session.user.id,
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
          await tx.delete(session).where(eq(session.userId, targetMembershipInTx.userId));
        }

        const adminCountAfterRemoval = await countTenantAdmins({ tenantId, db: tx });
        assertTenantHasAdminOrThrow(adminCountAfterRemoval);

        return {
          targetUserId: targetMembershipInTx.userId,
          targetRole: targetMembershipInTx.role,
          sessionsInvalidated: shouldInvalidateSessions,
        };
      });

      if (isSelfRemoval) {
        ctx.responseHeaders.append("Set-Cookie", buildClearSessionCookie());
      }

      logger.info(
        {
          event: isSelfRemoval
            ? "audit.auth.team_member.self_removal.confirmed"
            : "audit.auth.team_member.remove.success",
          actorUserId: ctx.session.user.id,
          tenantId,
          targetUserId: removalResult.targetUserId,
          targetRole: removalResult.targetRole,
          sessionsInvalidated: removalResult.sessionsInvalidated,
        },
        "Member removed from tenant"
      );

      return {
        success: true,
        message: isSelfRemoval
          ? "You have been removed from this tenant."
          : "Member removed successfully.",
        requiresSecondConfirmation: false,
        memberUserId: removalResult.targetUserId,
      };
    }),

  /**
   * Get the current authenticated user's tenant memberships
   */
  getTenantMemberships: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.query.tenantMemberships.findMany({
      where: eq(tenantMemberships.userId, ctx.session.user.id),
      with: {
        tenant: true,
      },
    });

    return memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      role: m.role,
    }));
  }),

  /**
   * List all pending invitations in current tenant.
   * Admin-only.
   */
  listInvitations: protectedProcedure
    .output(listInvitationsOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const actorMembership = await getCurrentTenantMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      if (!canManageTenantMembers(actorMembership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins can view invitations.",
        });
      }

      const invitations = await ctx.db.query.tenantInvitations.findMany({
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
    }),

  /**
   * Create a new invitation to join the tenant.
   * Admin-only.
   */
  createInvitation: protectedProcedure
    .input(createInvitationInputSchema)
    .output(createInvitationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const actorMembership = await getCurrentTenantMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      if (!canManageTenantMembers(actorMembership.role)) {
        logger.warn(
          {
            event: "audit.auth.invitation.create.forbidden",
            actorUserId: ctx.session.user.id,
            tenantId,
            actorRole: actorMembership.role,
            targetEmail: input.email,
          },
          "Forbidden invitation creation attempt"
        );

        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins can create invitations.",
        });
      }

      const normalizedEmail = input.email.trim().toLowerCase();

      // Check if user is already a member
      const existingMembership = await ctx.db
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

      // Revoke expired pending invitations for the same email so they no longer
      // block a fresh invite.
      await ctx.db
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

      // Check for existing pending invitation
      const existingInvitation = await ctx.db.query.tenantInvitations.findFirst({
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

      // Generate secure random token
      const token = crypto.randomUUID();
      const tokenHash = await hashToken(token);

      // Create invitation with 7-day expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      let invitation: typeof tenantInvitations.$inferSelect | undefined;
      try {
        [invitation] = await ctx.db
          .insert(tenantInvitations)
          .values({
            tenantId,
            email: normalizedEmail,
            role: input.role,
            tokenHash,
            expiresAt,
            invitedByUserId: ctx.session.user.id,
          })
          .returning();
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

      // Get tenant and inviter details for email
      const tenant = await ctx.db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { name: true },
      });

      const invitedByUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, ctx.session.user.id),
        columns: { name: true },
      });

      // Send invitation email
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
          actorUserId: ctx.session.user.id,
          tenantId,
          invitationId: invitation.id,
          targetEmail: normalizedEmail,
          targetRole: input.role,
        },
        "Invitation created and email queued"
      );

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
    }),

  /**
   * Revoke a pending invitation.
   * Admin-only.
   */
  revokeInvitation: protectedProcedure
    .input(revokeInvitationInputSchema)
    .output(revokeInvitationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = assertTenantId(ctx.tenantId);
      const actorMembership = await getCurrentTenantMembershipOrThrow({
        tenantId,
        userId: ctx.session.user.id,
        db: ctx.db,
      });

      if (!canManageTenantMembers(actorMembership.role)) {
        logger.warn(
          {
            event: "audit.auth.invitation.revoke.forbidden",
            actorUserId: ctx.session.user.id,
            tenantId,
            actorRole: actorMembership.role,
            invitationId: input.invitationId,
          },
          "Forbidden invitation revocation attempt"
        );

        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admins can revoke invitations.",
        });
      }

      const invitation = await ctx.db.query.tenantInvitations.findFirst({
        where: and(
          eq(tenantInvitations.id, input.invitationId),
          eq(tenantInvitations.tenantId, tenantId)
        ),
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      if (invitation.revokedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation is already revoked.",
        });
      }

      if (invitation.usedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation has already been used.",
        });
      }

      await ctx.db
        .update(tenantInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(tenantInvitations.id, input.invitationId));

      logger.info(
        {
          event: "audit.auth.invitation.revoke.success",
          actorUserId: ctx.session.user.id,
          tenantId,
          invitationId: input.invitationId,
          targetEmail: invitation.email,
        },
        "Invitation revoked successfully"
      );

      return {
        success: true,
        message: "Invitation revoked successfully.",
      };
    }),

  /**
   * Preview/validate an invitation token.
   * Public procedure - no authentication required.
   */
  previewInvitation: publicProcedure
    .input(previewInvitationInputSchema)
    .output(previewInvitationResponseSchema)
    .query(async ({ ctx, input }) => {
      const tokenHash = await hashToken(input.token);
      const clientIp = getClientIp(ctx.headers);

      return ctx.db.transaction(async (tx) => {
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
            state: "expired" as const,
            message:
              "This invitation link is invalid or has expired. Please request a new invitation from an Admin.",
          };
        }

        if (invitation.usedAt) {
          logger.info(
            {
              event: "audit.auth.invitation.preview.rejected",
              reason: "used",
              invitationId: invitation.id,
              clientIp,
            },
            "Invitation preview rejected"
          );
          return {
            valid: false,
            state: "used" as const,
            message:
              "This invitation has already been used. Please request a new invitation from an Admin.",
          };
        }

        if (invitation.revokedAt) {
          logger.info(
            {
              event: "audit.auth.invitation.preview.rejected",
              reason: "revoked",
              invitationId: invitation.id,
              clientIp,
            },
            "Invitation preview rejected"
          );
          return {
            valid: false,
            state: "revoked" as const,
            message:
              "This invitation has been revoked. Please request a new invitation from an Admin.",
          };
        }

        if (invitation.expiresAt < new Date()) {
          logger.info(
            {
              event: "audit.auth.invitation.preview.rejected",
              reason: "expired",
              invitationId: invitation.id,
              clientIp,
            },
            "Invitation preview rejected"
          );
          return {
            valid: false,
            state: "expired" as const,
            message:
              "This invitation has expired. Please request a new invitation from an Admin.",
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
    }),

  /**
   * Accept an invitation and create user account.
   * Public procedure - no authentication required.
   */
  acceptInvitation: publicProcedure
    .input(acceptInvitationInputSchema)
    .output(acceptInvitationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const tokenHash = await hashToken(input.token);
      const clientIp = getClientIp(ctx.headers);
      let createdUserId: string | null = null;
      let result:
        | {
            userId: string;
            tenantId: string;
            isNewUser: boolean;
          }
        | undefined;

      try {
        result = await ctx.db.transaction(async (tx) => {
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
                "This invitation has already been used. Please request a new invitation from an Admin.",
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
                "This invitation has been revoked. Please request a new invitation from an Admin.",
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
                "This invitation has expired. Please request a new invitation from an Admin.",
            });
          }

          // Atomically consume token in this transaction before continuing. If
          // another request consumed it first, no row is returned.
          const consumedAt = new Date();
          const [consumedInvitation] = await tx
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

          if (!consumedInvitation) {
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

          const existingUser = await tx.query.user.findFirst({
            where: eq(user.email, consumedInvitation.email),
          });

          let userId: string;

          if (existingUser) {
            const existingMembership = await tx.query.tenantMemberships.findFirst({
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
              throw new TRPCError({
                code: "CONFLICT",
                message: "You are already a member of this tenant.",
              });
            }

            userId = existingUser.id;
          } else {
            const userName =
              consumedInvitation.email.split("@")[0] ?? consumedInvitation.email;
            const signUpResult = await auth.api.signUpEmail({
              body: {
                email: consumedInvitation.email,
                password: input.password,
                name: userName,
                callbackURL: "/dashboard",
              },
              headers: ctx.headers,
            });

            if (!signUpResult?.user?.id) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create user account.",
              });
            }

            userId = signUpResult.user.id;
            createdUserId = userId;
          }

          await setTenantContext(consumedInvitation.tenantId, tx);

          await tx.insert(tenantMemberships).values({
            tenantId: consumedInvitation.tenantId,
            userId,
            role: consumedInvitation.role,
          });

          await tx
            .update(user)
            .set({ defaultTenantId: consumedInvitation.tenantId })
            .where(eq(user.id, userId));

          return {
            userId,
            tenantId: consumedInvitation.tenantId,
            isNewUser: !existingUser,
          };
        });
      } catch (error) {
        if (createdUserId) {
          try {
            await ctx.db.delete(user).where(eq(user.id, createdUserId));
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

        throw error;
      }

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to accept invitation.",
        });
      }

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
    }),
});

/**
 * Hash an invitation token using SHA-256
 * This is a one-way hash for secure token storage
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
