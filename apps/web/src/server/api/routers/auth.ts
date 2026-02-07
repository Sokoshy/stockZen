import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import {
  loginResponseSchema,
  loginSchema,
  signUpResponseSchema,
  signUpSchema,
} from "~/schemas/auth";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  extractSessionToken,
} from "~/server/better-auth/session-cookie";
import { setTenantContext } from "~/server/db/rls";
import { session, tenantMemberships, tenants, user } from "~/server/db/schema";
import { logger } from "~/server/logger";
import { getClientIp, rateLimit } from "~/server/rate-limit";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 30;
const REMEMBER_ME_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GENERIC_LOGIN_ERROR = "Invalid email or password";

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
});
