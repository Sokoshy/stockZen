import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { signUpSchema, signUpResponseSchema } from "~/schemas/auth";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { buildSessionCookie, extractSessionToken } from "~/server/better-auth/session-cookie";
import { setTenantContext } from "~/server/db/rls";
import { tenantMemberships, tenants, user } from "~/server/db/schema";
import { logger } from "~/server/logger";
import { getClientIp, rateLimit } from "~/server/rate-limit";

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
