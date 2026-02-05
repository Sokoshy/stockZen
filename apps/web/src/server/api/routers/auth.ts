import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { signUpSchema, signUpResponseSchema } from "~/schemas/auth";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { tenantMemberships, tenants, user } from "~/server/db/schema";

export const authRouter = createTRPCRouter({
  /**
   * Sign up a new user with tenant creation
   * This creates:
   * 1. A new tenant
   * 2. A new user (via Better Auth)
   * 3. A tenant membership with Admin role
   * 
   * All operations are performed in a transaction to ensure atomicity
   */
  signUp: publicProcedure
    .input(signUpSchema)
    .output(signUpResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { email, password, tenantName } = input;

      try {
        // Check if email is already in use
        const existingUser = await db.query.user.findFirst({
          where: eq(user.email, email),
        });

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }

        // Create tenant, user, and membership in a transaction
        const result = await db.transaction(async (tx) => {
          // 1. Create the tenant
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

          // 2. Create the user via Better Auth
          const userName = email.split("@")[0] ?? email; // Use email prefix as default name
          const betterAuthResult = await auth.api.signUpEmail({
            body: {
              email,
              password,
              name: userName,
              callbackURL: "/dashboard",
            },
          });

          if (!betterAuthResult?.user?.id) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create user account",
            });
          }

          // 3. Create tenant membership with Admin role
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

          return {
            user: betterAuthResult.user,
            tenant: newTenant,
          };
        });

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
        // Handle specific error types
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log unexpected errors (without exposing sensitive details)
        console.error("Sign up error:", error);

        // Return generic error to avoid exposing system details
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An error occurred during sign up. Please try again.",
        });
      }
    }),

  /**
   * Get the current authenticated user's tenant memberships
   */
  getTenantMemberships: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      return [];
    }

    const memberships = await db.query.tenantMemberships.findMany({
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
