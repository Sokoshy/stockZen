// @vitest-environment node

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { products, session, tenantMemberships, user } from "~/server/db/schema";
import {
  cleanDatabase,
  createTestDb,
  generateTestEmail,
  generateTestTenantName,
} from "../helpers/database";

function extractSessionCookie(setCookieHeader: string): string {
  const sessionPart = setCookieHeader
    .split(";")
    .find((part) => part.trim().startsWith("__session="));

  if (!sessionPart) {
    throw new Error("Expected __session cookie in Set-Cookie header");
  }

  return sessionPart.trim();
}

let ipSequence = 200;
function nextIp(): string {
  ipSequence += 1;
  return `127.0.30.${ipSequence}`;
}

async function createProtectedCaller(cookie: string, clientIp: string) {
  const headers = new Headers({
    cookie,
    "x-forwarded-for": clientIp,
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });

  const ctx = await createTRPCContext({ headers });
  return {
    ctx,
    caller: createCaller(ctx),
  };
}

describe("Products RBAC", () => {
  const testDb = createTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    ipSequence += 20;
  });

  async function signUpUser() {
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

  async function addExistingUserToTenantWithRole(input: {
    tenantId: string;
    role: "Admin" | "Manager" | "Operator";
  }) {
    const created = await signUpUser();

    await testDb.insert(tenantMemberships).values({
      tenantId: input.tenantId,
      userId: created.userId,
      role: input.role,
    });

    await testDb
      .update(user)
      .set({ defaultTenantId: input.tenantId })
      .where(eq(user.id, created.userId));

    return created;
  }

  it("omits purchasePrice for Operator list and detail responses", async () => {
    const admin = await signUpUser();
    const operator = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Operator",
    });

    const { caller: adminCaller } = await createProtectedCaller(admin.cookie, admin.ip);
    const created = await adminCaller.products.create({
      name: "Flour",
      price: 42,
      purchasePrice: 21,
      quantity: 10,
    });

    const { caller: operatorCaller } = await createProtectedCaller(operator.cookie, operator.ip);
    const listResult = await operatorCaller.products.list();
    const detailResult = await operatorCaller.products.getById({ id: created.id as string });

    expect(listResult.actorRole).toBe("Operator");
    expect(listResult.products.length).toBeGreaterThan(0);
    expect(listResult.products[0]).not.toHaveProperty("purchasePrice");
    expect(detailResult).not.toHaveProperty("purchasePrice");
  });

  it("returns purchasePrice for Admin and Manager in the same tenant", async () => {
    const admin = await signUpUser();
    const manager = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Manager",
    });

    const { caller: adminCaller } = await createProtectedCaller(admin.cookie, admin.ip);
    const created = await adminCaller.products.create({
      name: "Butter",
      price: 30,
      purchasePrice: 18,
      quantity: 5,
    });

    const adminList = await adminCaller.products.list();
    expect(adminList.actorRole).toBe("Admin");
    expect(adminList.products[0]).toHaveProperty("purchasePrice");

    const { caller: managerCaller } = await createProtectedCaller(manager.cookie, manager.ip);
    const managerDetail = await managerCaller.products.getById({ id: created.id as string });
    expect(managerDetail).toHaveProperty("purchasePrice");
  });

  it("prevents cross-tenant product access", async () => {
    const adminA = await signUpUser();
    const adminB = await signUpUser();

    const { caller: adminACaller } = await createProtectedCaller(adminA.cookie, adminA.ip);
    const created = await adminACaller.products.create({
      name: "Milk",
      price: 12,
      purchasePrice: 9,
      quantity: 4,
    });

    const { caller: adminBCaller } = await createProtectedCaller(adminB.cookie, adminB.ip);

    await expect(adminBCaller.products.getById({ id: created.id as string })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const adminBList = await adminBCaller.products.list();
    expect(adminBList.products.some((product) => product.id === created.id)).toBe(false);
  });

  it("sanitizes Operator purchasePrice writes on create and update", async () => {
    const admin = await signUpUser();
    const operator = await addExistingUserToTenantWithRole({
      tenantId: admin.tenantId,
      role: "Operator",
    });

    const { caller: operatorCaller } = await createProtectedCaller(operator.cookie, operator.ip);
    const operatorCreated = await operatorCaller.products.create({
      name: "Sugar",
      price: 7,
      purchasePrice: 4,
      quantity: 1,
    });

    expect(operatorCreated).not.toHaveProperty("purchasePrice");

    const createdRow = await testDb.query.products.findFirst({
      where: and(eq(products.id, operatorCreated.id as string), eq(products.tenantId, admin.tenantId)),
    });
    expect(createdRow?.purchasePrice).toBeNull();

    const { caller: adminCaller } = await createProtectedCaller(admin.cookie, admin.ip);
    const adminCreated = await adminCaller.products.create({
      name: "Salt",
      price: 5,
      purchasePrice: 3,
      quantity: 8,
    });

    await operatorCaller.products.update({
      id: adminCreated.id as string,
      data: {
        purchasePrice: 99,
      },
    });

    const updatedRow = await testDb.query.products.findFirst({
      where: and(eq(products.id, adminCreated.id as string), eq(products.tenantId, admin.tenantId)),
    });
    expect(updatedRow?.purchasePrice).toBe("3.00");
  });

  it("allows Admin to clear purchasePrice by setting null", async () => {
    const admin = await signUpUser();
    const { caller: adminCaller } = await createProtectedCaller(admin.cookie, admin.ip);

    const created = await adminCaller.products.create({
      name: "Cocoa",
      price: 14,
      purchasePrice: 9,
      quantity: 6,
    });

    const updated = await adminCaller.products.update({
      id: created.id as string,
      data: {
        purchasePrice: null,
      },
    });

    expect(updated).toHaveProperty("purchasePrice", null);

    const updatedRow = await testDb.query.products.findFirst({
      where: and(eq(products.id, created.id as string), eq(products.tenantId, admin.tenantId)),
    });

    expect(updatedRow?.purchasePrice).toBeNull();
  });
});
