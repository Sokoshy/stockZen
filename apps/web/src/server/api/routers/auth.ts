import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";

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
  listAuditEventsInputSchema,
  listAuditEventsOutputSchema,
} from "~/schemas/audit-events";
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
import { adminProcedure, createTRPCRouter, membershipProcedure, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { invitationService } from "~/server/services/invitation-service";
import { membershipService } from "~/server/services/membership-service";

import { auth } from "~/server/better-auth";
import {
  getTrustedPasswordResetRedirectUrl,
} from "~/server/better-auth/password-reset-email";

import {
  buildClearSessionCookie,
  extractSessionToken,
} from "~/server/better-auth/session-cookie";
import {
  applyRememberMeExtension,
  destroySession,
  setSessionCookieAfterAuth,
} from "~/server/lib/session-lifecycle";
import {
  extractErrorMessage,
  isInvalidResetTokenError,
} from "~/server/better-auth/password-reset-errors";
import { db as rootDb } from "~/server/db";
import { setTenantContext } from "~/server/db/rls";
import {
  session,
  tenantMemberships,
  tenants,
  user,
  verification,
} from "~/server/db/schema";
import { logger } from "~/server/logger";
import { getClientIp, rateLimit } from "~/server/rate-limit";
import { createAuditEvent } from "~/server/services/audit-service";

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

async function getUserAuditContextByEmail(input: {
  email: string;
  db: Pick<typeof rootDb, "query">;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  const userRecord = await input.db.query.user.findFirst({
    columns: {
      id: true,
      defaultTenantId: true,
    },
    where: sql`lower(${user.email}) = ${normalizedEmail}`,
  });

  return {
    userId: userRecord?.id ?? null,
    tenantId: userRecord?.defaultTenantId ?? null,
  };
}

async function getUserAuditContextFromPasswordResetToken(input: {
  token: string;
  db: Pick<typeof rootDb, "query">;
}) {
  const verificationRecord = await input.db.query.verification.findFirst({
    columns: {
      identifier: true,
      expiresAt: true,
    },
    where: eq(verification.value, input.token),
  });

  if (!verificationRecord || verificationRecord.expiresAt < new Date()) {
    return { userId: null, tenantId: null };
  }

  const identifier = verificationRecord.identifier.trim();
  const identifierTail = identifier.includes(":")
    ? identifier.split(":").at(-1)?.trim() ?? identifier
    : identifier;

  const byId = await input.db.query.user.findFirst({
    columns: {
      id: true,
      defaultTenantId: true,
    },
    where: eq(user.id, identifierTail),
  });

  if (byId?.defaultTenantId) {
    return { userId: byId.id, tenantId: byId.defaultTenantId };
  }

  const byEmail = await input.db.query.user.findFirst({
    columns: {
      id: true,
      defaultTenantId: true,
    },
    where: sql`lower(${user.email}) = ${identifierTail.toLowerCase()}`,
  });

  return {
    userId: byEmail?.id ?? null,
    tenantId: byEmail?.defaultTenantId ?? null,
  };
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
      const { email, password, tenantName, rememberMe } = input;

      const rateKey = `global:ip:${getClientIp(ctx.headers)}:sign-up`;
      const rateResult = await rateLimit(ctx.db, rateKey, { limit: 5, windowMs: 60_000 });
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

        // Extract session token from Better Auth result
        const sessionInfo = extractSessionToken(betterAuthResult);
        const sessionToken = sessionInfo.token || sessionInfo.setCookie;

        if (!sessionToken) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to establish a session after sign up.",
          });
        }

        // Extend session expiry if rememberMe is enabled, otherwise use provided expiry or default
        let sessionExpiresAt: Date;
        if (rememberMe) {
          sessionExpiresAt = await applyRememberMeExtension(ctx.db, sessionToken, rememberMe);
        } else if (sessionInfo.expiresAt) {
          sessionExpiresAt = new Date(sessionInfo.expiresAt);
        } else {
          // Default to 7 days if no expiry provided
          sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        setSessionCookieAfterAuth(ctx.responseHeaders, sessionToken, rememberMe, sessionExpiresAt);

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

      const rateKey = `global:ip:${clientIp}:login`;
      const rateResult = await rateLimit(ctx.db, rateKey, { limit: 5, windowMs: 60_000 });
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

        // Extract token from the Set-Cookie header in Better Auth's response
        const setCookieHeaders = extractSetCookieHeaders(betterAuthResult);
        const signedToken =
          setCookieHeaders
            .map((headerValue) => getSessionTokenFromSetCookie(headerValue))
            .find((value): value is string => Boolean(value)) ?? null;

        if (!signedToken) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to establish session cookie after login.",
          });
        }

        // Better Auth tokens are formatted as "<raw>.<signature>" — we extract
        // only the raw part since the DB stores the un-signed token.
        const tokenParts = signedToken.split(".");
        if (tokenParts.length < 2) {
          logger.warn(
            { tokenLength: signedToken.length },
            "Signed token missing '.' separator; using token as-is"
          );
        }
        const rawToken = tokenParts[0] ?? signedToken;

        const sessionExpiresAt = await applyRememberMeExtension(
          ctx.db,
          rawToken,
          rememberMe,
        );

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

        setSessionCookieAfterAuth(
          ctx.responseHeaders,
          signedToken,
          rememberMe,
          sessionExpiresAt,
        );

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

        // Persist audit event
        await createAuditEvent({
          db: ctx.db,
          tenantId: userRecord.defaultTenantId,
          actorUserId: userRecord.id,
          actionType: "login",
          status: "success",
          context: JSON.stringify({ rememberMe, clientIp }),
        });

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

        const failedLoginUser = await getUserAuditContextByEmail({
          email,
          db: ctx.db,
        });

        if (failedLoginUser.tenantId) {
          await createAuditEvent({
            db: ctx.db,
            tenantId: failedLoginUser.tenantId,
            actorUserId: failedLoginUser.userId,
            actionType: "login_failed",
            status: "failure",
            context: JSON.stringify({ clientIp, reason: "invalid_credentials" }),
          });
        } else {
          logger.warn(
            {
              event: "audit.auth.login.failed.no_tenant_context",
              clientIp,
              email,
            },
            "Skipping persistent failed-login audit event because tenant context is unknown"
          );
        }

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

      const rateKey = `global:ip:${clientIp}:password-reset-request`;
      const rateResult = await rateLimit(ctx.db, rateKey, PASSWORD_RESET_REQUEST_RATE_LIMIT);
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

      const rateKey = `global:ip:${clientIp}:password-reset-submit`;
      const rateResult = await rateLimit(ctx.db, rateKey, PASSWORD_RESET_SUBMIT_RATE_LIMIT);
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

      const passwordResetUser = await getUserAuditContextFromPasswordResetToken({
        token: input.token,
        db: ctx.db,
      });

      if (passwordResetUser.tenantId) {
        await createAuditEvent({
          db: ctx.db,
          tenantId: passwordResetUser.tenantId,
          actorUserId: passwordResetUser.userId,
          actionType: "password_reset_completed",
          status: "success",
          context: JSON.stringify({ clientIp }),
        });
      } else {
        logger.warn(
          {
            event: "audit.auth.password_reset.submit.no_tenant_context",
            clientIp,
          },
          "Skipping persistent password-reset audit event because tenant context is unknown"
        );
      }

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

      await destroySession(ctx.db, ctx.responseHeaders, currentToken);
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

    logger.info(
      {
        event: "audit.auth.logout.success",
        userId: logoutUserId,
      },
      "User logged out"
    );

    // Persist audit event if we have a userId
    if (logoutUserId) {
      const userRecord = await ctx.db.query.user.findFirst({
        where: eq(user.id, logoutUserId),
        columns: { defaultTenantId: true },
      });

      if (userRecord?.defaultTenantId) {
        await createAuditEvent({
          db: ctx.db,
          tenantId: userRecord.defaultTenantId,
          actorUserId: logoutUserId,
          actionType: "logout",
          status: "success",
        });
      }
    }

    return {
      success: true,
      message: "Logged out successfully",
    };
  }),

  /**
   * List all members in current tenant.
   */
  listTenantMembers: membershipProcedure
    .output(listTenantMembersOutputSchema)
    .query(async ({ ctx }) => {
      return membershipService.listTenantMembers(ctx.db, ctx.tenantId!, ctx.membership.role, ctx.session.user.id);
    }),

  /**
   * Update the role for a member in current tenant.
   */
  updateTenantMemberRole: membershipProcedure
    .input(updateTenantMemberRoleInputSchema)
    .output(updateTenantMemberRoleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return membershipService.updateMemberRole(ctx.db, ctx.tenantId!, ctx.session.user.id, ctx.membership.role, input);
    }),

  /**
   * Remove a member from current tenant.
   */
  removeTenantMember: membershipProcedure
    .input(removeTenantMemberInputSchema)
    .output(removeTenantMemberOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await membershipService.removeMember(ctx.db, ctx.tenantId!, ctx.session.user.id, ctx.membership.role, input);

      if (result.requiresSecondConfirmation) {
        return result;
      }

      if (input.memberUserId === ctx.session.user.id) {
        ctx.responseHeaders.append("Set-Cookie", buildClearSessionCookie());
      }

      return result;
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
  listInvitations: adminProcedure
    .output(listInvitationsOutputSchema)
    .query(async ({ ctx }) => {
      return invitationService.listInvitations(ctx.db, ctx.tenantId!);
    }),

  /**
   * Create a new invitation to join the tenant.
   * Admin-only.
   */
  createInvitation: adminProcedure
    .input(createInvitationInputSchema)
    .output(createInvitationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      return invitationService.createInvitation(ctx.db, ctx.tenantId!, ctx.session.user.id, input);
    }),

  /**
   * Revoke a pending invitation.
   * Admin-only.
   */
  revokeInvitation: adminProcedure
    .input(revokeInvitationInputSchema)
    .output(revokeInvitationResponseSchema)
    .mutation(async ({ ctx, input }) => {
      return invitationService.revokeInvitation(ctx.db, ctx.tenantId!, ctx.session.user.id, input);
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
      return invitationService.previewInvitation(ctx.db, input.token, tokenHash, ctx.headers);
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
      return invitationService.acceptInvitation(ctx.db, ctx.headers, {
        token: input.token,
        password: input.password,
        tokenHash,
      });
    }),

  /**
   * List audit events for the current tenant.
   * Admin-only.
   */
  listAuditEvents: adminProcedure
    .input(listAuditEventsInputSchema)
    .output(listAuditEventsOutputSchema)
    .query(async ({ ctx, input }) => {
      return membershipService.listAuditEvents(ctx.db, ctx.tenantId!, input);
    }),

  getCurrentTenantMembership: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId;

      if (!tenantId) {
        return null;
      }

      const membership = await ctx.db.query.tenantMemberships.findFirst({
        where: (tm, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
      });

      if (!membership) {
        return null;
      }

      return {
        tenantId: membership.tenantId,
        role: membership.role,
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
