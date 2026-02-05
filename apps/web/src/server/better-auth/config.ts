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
      sessionToken: {
        name: "__session",
        options: {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day - refresh session if older than this
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
