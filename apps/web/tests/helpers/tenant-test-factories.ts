import { eq } from "drizzle-orm";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import {
  products,
  session,
  tenantMemberships,
  user,
} from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "./database";

let ipSequence = 1000;

function nextIp(): string {
  ipSequence += 1;
  return `127.0.50.${ipSequence}`;
}

function extractSessionCookie(setCookieHeader: string): string {
  const sessionPart = setCookieHeader
    .split(";")
    .find((part) => part.trim().startsWith("__session="));

  if (!sessionPart) {
    throw new Error("Expected __session cookie in Set-Cookie header");
  }

  return sessionPart.trim();
}

export interface TestTenant {
  userId: string;
  tenantId: string;
  email: string;
  cookie: string;
  ip: string;
}

export interface TenantContext {
  ctx: Awaited<ReturnType<typeof createTRPCContext>>;
  caller: ReturnType<typeof createCaller>;
  tenant: TestTenant;
}

export type IsolationEntityType = "products" | "tenantMemberships";

const testDb = createTestDb();

export async function cleanTestDatabase(): Promise<void> {
  await cleanDatabase(testDb);
  ipSequence += 20;
}

export async function createTestTenant(): Promise<TestTenant> {
  const email = generateTestEmail();
  const password = "Password123";
  const tenantName = generateTestTenantName();
  const signUpIp = nextIp();

  const signUpCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": signUpIp }),
  });
  const signUpCaller = createCaller(signUpCtx);

  const signUpResult = await signUpCaller.auth.signUp({
    email,
    password,
    confirmPassword: password,
    tenantName,
  });

  if (!signUpResult.user?.id || !signUpResult.tenant?.id) {
    throw new Error("Expected sign-up to return user and tenant IDs");
  }

  await testDb.delete(session).where(eq(session.userId, signUpResult.user.id));

  const loginIp = nextIp();
  const loginCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": loginIp }),
  });
  const loginCaller = createCaller(loginCtx);
  await loginCaller.auth.login({
    email,
    password,
    rememberMe: false,
  });

  const setCookie = loginCtx.responseHeaders.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login response to include session cookie");
  }

  return {
    userId: signUpResult.user.id,
    tenantId: signUpResult.tenant.id,
    email,
    cookie: extractSessionCookie(setCookie),
    ip: loginIp,
  };
}

export async function createTenantContext(tenant: TestTenant): Promise<TenantContext> {
  const headers = new Headers({
    cookie: tenant.cookie,
    "x-forwarded-for": tenant.ip,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const ctx = await createTRPCContext({ headers });
  const caller = createCaller(ctx);

  return { ctx, caller, tenant };
}

export async function addUserToTenantWithRole(
  tenantId: string,
  role: "Admin" | "Manager" | "Operator"
): Promise<TestTenant> {
  const newTenant = await createTestTenant();

  await testDb.insert(tenantMemberships).values({
    tenantId,
    userId: newTenant.userId,
    role,
  });

  await testDb
    .update(user)
    .set({ defaultTenantId: tenantId })
    .where(eq(user.id, newTenant.userId));

  const headers = new Headers({
    cookie: newTenant.cookie,
    "x-forwarded-for": newTenant.ip,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const loginCtx = await createTRPCContext({ headers });
  const loginCaller = createCaller(loginCtx);
  await loginCaller.auth.login({
    email: newTenant.email,
    password: "Password123",
    rememberMe: false,
  });

  const setCookie = loginCtx.responseHeaders.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login response to include session cookie");
  }

  return {
    ...newTenant,
    cookie: extractSessionCookie(setCookie),
  };
}

export async function attemptCrossTenantRead(
  caller: ReturnType<typeof createCaller>,
  entityType: IsolationEntityType,
  targetId: string
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    switch (entityType) {
      case "products":
        return { success: true, data: await caller.products.getById({ id: targetId }) };
      case "tenantMemberships": {
        const members = await caller.auth.listTenantMembers();
        const leakedMember = members.members.find((member) => member.userId === targetId);
        if (!leakedMember) {
          return { success: false, error: "NOT_FOUND" };
        }

        return { success: true, data: leakedMember };
      }
    }

    return { success: false, error: "UNKNOWN_ENTITY" };
  } catch (error) {
    const trpcError = error as { code?: string; message?: string };
    return {
      success: false,
      error: trpcError.code || "UNKNOWN",
    };
  }
}

export async function attemptCrossTenantWrite(
  caller: ReturnType<typeof createCaller>,
  entityType: IsolationEntityType,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (entityType) {
      case "products":
        await caller.products.update({
          id: data.targetId as string,
          data: { name: data.name as string },
        });
        break;
      case "tenantMemberships":
        await caller.auth.updateTenantMemberRole({
          memberUserId: data.memberUserId as string,
          role: data.role as "Admin" | "Manager" | "Operator",
        });
        break;
    }

    return { success: true };
  } catch (error) {
    const trpcError = error as { code?: string; message?: string };
    return {
      success: false,
      error: trpcError.code || "UNKNOWN",
    };
  }
}

export async function createProductInTenant(
  caller: ReturnType<typeof createCaller>,
  productData: { name: string; price: number; quantity: number; purchasePrice?: number; category?: string; unit?: string }
): Promise<string> {
  const result = await caller.products.create({
    name: productData.name,
    price: productData.price,
    quantity: productData.quantity,
    category: productData.category ?? "Test Category",
    unit: productData.unit ?? "pcs",
    ...(productData.purchasePrice !== undefined && { purchasePrice: productData.purchasePrice }),
  });
  return result.id as string;
}

export async function verifyTenantIsolation(
  tenantA: TestTenant,
  tenantB: TestTenant
): Promise<{
  readBlocked: boolean;
  writeBlocked: boolean;
  details: string[];
}> {
  const details: string[] = [];

  const contextA = await createTenantContext(tenantA);
  const contextB = await createTenantContext(tenantB);
  const managerInTenantA = await addUserToTenantWithRole(tenantA.tenantId, "Manager");

  const productId = await createProductInTenant(contextA.caller, {
    name: "Test Product A",
    price: 100,
    quantity: 10,
  });
  details.push(`Created product ${productId} in Tenant A`);

  const readAttempt = await attemptCrossTenantRead(
    contextB.caller,
    "products",
    productId
  );
  const productReadBlocked = !readAttempt.success;
  const membershipReadAttempt = await attemptCrossTenantRead(
    contextB.caller,
    "tenantMemberships",
    managerInTenantA.userId
  );
  const membershipReadBlocked = !membershipReadAttempt.success;

  const readBlocked = productReadBlocked && membershipReadBlocked;
  details.push(
    `Cross-tenant product read attempt: ${productReadBlocked ? "BLOCKED" : "ALLOWED (SECURITY ISSUE!)"}`
  );
  details.push(
    `Cross-tenant membership read attempt: ${membershipReadBlocked ? "BLOCKED" : "ALLOWED (SECURITY ISSUE!)"}`
  );

  const writeAttempt = await attemptCrossTenantWrite(contextB.caller, "products", {
    targetId: productId,
    name: "Hacker Product",
  });
  const productWriteBlocked = !writeAttempt.success;
  const membershipWriteAttempt = await attemptCrossTenantWrite(
    contextB.caller,
    "tenantMemberships",
    {
      memberUserId: managerInTenantA.userId,
      role: "Operator",
    }
  );
  const membershipWriteBlocked = !membershipWriteAttempt.success;

  const writeBlocked = productWriteBlocked && membershipWriteBlocked;
  details.push(
    `Cross-tenant product write attempt: ${productWriteBlocked ? "BLOCKED" : "ALLOWED (SECURITY ISSUE!)"}`
  );
  details.push(
    `Cross-tenant membership write attempt: ${membershipWriteBlocked ? "BLOCKED" : "ALLOWED (SECURITY ISSUE!)"}`
  );

  return { readBlocked, writeBlocked, details };
}

export interface TenantWithAdmin {
  admin: {
    id: string;
    email: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
  };
  password: string;
  sessionToken: string;
}

export interface UserWithMembership {
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenantId: string;
  role: string;
  sessionToken: string;
}

export async function createTenantWithAdmin(prefix: string): Promise<TenantWithAdmin> {
  const email = generateTestEmail(prefix);
  const password = "Password123!";
  const tenantName = generateTestTenantName(prefix);

  const ctx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": nextIp() }),
  });
  const caller = createCaller(ctx);

  const result = await caller.auth.signUp({
    email,
    password,
    confirmPassword: password,
    tenantName,
  });

  if (!result.user?.id || !result.tenant?.id) {
    throw new Error("Failed to create tenant with admin");
  }

  await testDb.delete(session).where(eq(session.userId, result.user.id));

  const loginCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": nextIp() }),
  });
  const loginCaller = createCaller(loginCtx);
  await loginCaller.auth.login({
    email,
    password,
    rememberMe: false,
  });

  const setCookie = loginCtx.responseHeaders.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login to include session cookie");
  }

  return {
    admin: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
    },
    password,
    sessionToken: extractSessionCookie(setCookie),
  };
}

export async function createUserWithMembership({
  tenantId,
  role,
  emailPrefix,
}: {
  tenantId: string;
  role: "Admin" | "Manager" | "Operator";
  emailPrefix: string;
}): Promise<UserWithMembership> {
  const email = generateTestEmail(emailPrefix);
  const password = "Password123!";

  // Create user through sign-up first
  const ctx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": nextIp() }),
  });
  const caller = createCaller(ctx);

  // First create the user by signing up in a different tenant
  const tempTenantName = generateTestTenantName(`${emailPrefix}-temp`);
  const signUpResult = await caller.auth.signUp({
    email,
    password,
    confirmPassword: password,
    tenantName: tempTenantName,
  });

  if (!signUpResult.user?.id) {
    throw new Error("Failed to create user");
  }

  // Add user to the target tenant with the specified role
  await testDb.insert(tenantMemberships).values({
    tenantId,
    userId: signUpResult.user.id,
    role,
  });

  // Update default tenant
  await testDb
    .update(user)
    .set({ defaultTenantId: tenantId })
    .where(eq(user.id, signUpResult.user.id));

  // Login to get session token
  const loginCtx = await createTRPCContext({
    headers: new Headers({ "x-forwarded-for": nextIp() }),
  });
  const loginCaller = createCaller(loginCtx);
  await loginCaller.auth.login({
    email,
    password,
    rememberMe: false,
  });

  const setCookie = loginCtx.responseHeaders.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected login to include session cookie");
  }

  return {
    user: {
      id: signUpResult.user.id,
      email: signUpResult.user.email,
      name: signUpResult.user.name,
    },
    tenantId,
    role,
    sessionToken: extractSessionCookie(setCookie),
  };
}

export async function getTestDb() {
  return testDb;
}

export async function cleanupTestData(): Promise<void> {
  await cleanDatabase(testDb);
}

export { testDb, nextIp };
