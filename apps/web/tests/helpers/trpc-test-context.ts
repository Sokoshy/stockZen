import { db } from "~/server/db";

export interface TestContextOptions {
  db?: typeof db;
  sessionToken?: string;
  tenantId?: string;
}

export async function setupTestTRPCContext(options: TestContextOptions = {}) {
  const headers = new Headers();

  if (options.sessionToken) {
    const cookieValue = options.sessionToken.startsWith("__session=")
      ? options.sessionToken
      : `__session=${options.sessionToken}`;
    headers.set("cookie", cookieValue);
  }

  const { createTRPCContext } = await import("~/server/api/trpc");
  const ctx = await createTRPCContext({ headers });

  const contextWithTenant = options.tenantId
    ? {
        ...ctx,
        tenantId: options.tenantId,
      }
    : ctx;

  // Override db if provided
  if (options.db) {
    return {
      ...contextWithTenant,
      db: options.db,
    };
  }

  return contextWithTenant;
}
