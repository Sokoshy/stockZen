import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "~/lib/env";
import { db } from "~/server/db";

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
