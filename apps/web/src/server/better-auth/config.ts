import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "~/lib/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger";

import { queuePasswordResetEmail } from "./password-reset-email";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 15,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      queuePasswordResetEmail({
        userId: user.id,
        email: user.email,
        token,
      });

      logger.info(
        {
          event: "audit.auth.password_reset.email_queued",
          userId: user.id,
        },
        "Password reset email queued"
      );
    },
    onPasswordReset: async ({ user }) => {
      logger.info(
        {
          event: "audit.auth.password_reset.success",
          userId: user.id,
        },
        "Password reset completed"
      );
    },
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
      redirectURI: env.BETTER_AUTH_GITHUB_REDIRECT_URI,
    },
  },
  advanced: {
    cookies: {
      session_token: {
        name: "__session",
        attributes: {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 30, // 30 minutes (default short session)
    updateAge: 60 * 5, // 5 minutes - refresh session if older than this
  },
  user: {
    additionalFields: {
      defaultTenantId: {
        type: "string",
        required: false,
        input: false, // Can't be set during signup
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
