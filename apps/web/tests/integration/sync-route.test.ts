import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "~/app/api/sync/route";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { user, tenants, tenantMemberships, products, stockMovements } from "~/server/db/schema";
import { eq } from "drizzle-orm";

vi.mock("~/server/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("~/server/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 29, resetAt: Date.now() + 60000 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

async function createTestTenant() {
  const tenantId = crypto.randomUUID();
  await db.insert(tenants).values({
    id: tenantId,
    name: `Test Tenant ${tenantId.slice(0, 8)}`,
  });
  return tenantId;
}

async function createTestUser(tenantId: string) {
  const userId = `user-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `test-${userId}@example.com`,
    emailVerified: true,
    defaultTenantId: tenantId,
  });
  await db.insert(tenantMemberships).values({
    tenantId,
    userId,
    role: "Admin",
  });
  return userId;
}

async function createTestProduct(tenantId: string) {
  const productId = crypto.randomUUID();
  await db.insert(products).values({
    id: productId,
    tenantId,
    name: `Test Product ${productId.slice(0, 8)}`,
    price: "10.00",
    quantity: 100,
  });
  return productId;
}

function mockSession(userId: string, email: string, defaultTenantId?: string) {
  return {
    user: { 
      id: userId, 
      name: "Test User", 
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      defaultTenantId: defaultTenantId ?? null,
    },
    session: { 
      id: "session-1", 
      userId, 
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      updatedAt: new Date(),
      token: "test-token",
    },
  };
}

describe("POST /api/sync", () => {
  let tenantId: string;
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    tenantId = await createTestTenant();
    userId = await createTestUser(tenantId);
    productId = await createTestProduct(tenantId);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{ operationId: "op-1", entityId: "e-1", entityType: "product", operationType: "create", tenantId, payload: {} }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user has no tenant context", async () => {
    const userIdNoTenant = `user-no-tenant-${crypto.randomUUID()}`;
    await db.insert(user).values({
      id: userIdNoTenant,
      name: "No Tenant User",
      email: `no-tenant-${userIdNoTenant}@example.com`,
      emailVerified: true,
    });

    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userIdNoTenant, `no-tenant-${userIdNoTenant}@example.com`));

    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{ operationId: "op-1", entityId: "e-1", entityType: "product", operationType: "create", tenantId, payload: {} }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("returns 403 when operation tenant mismatches authenticated tenant", async () => {
    const otherTenantId = await createTestTenant();

    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{ operationId: "op-1", idempotencyKey: "op-1", entityId: "e-1", entityType: "product", operationType: "create", tenantId: otherTenantId, payload: { tenantId: otherTenantId } }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.code).toBe("TENANT_MISMATCH");
  });

  it("returns 400 when Idempotency-Key header mismatches operationId for single-operation sync", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "Idempotency-Key": "different-operation-id",
      }),
      body: JSON.stringify({
        operations: [{
          operationId: "op-1",
          idempotencyKey: "op-1",
          entityId: "entity-1",
          entityType: "product",
          operationType: "create",
          tenantId,
          payload: { tenantId, name: "Product" },
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("creates product via sync and returns success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const operationId = crypto.randomUUID();
    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{
          operationId,
          idempotencyKey: operationId,
          entityId: operationId,
          entityType: "product",
          operationType: "create",
          tenantId,
          payload: {
            tenantId,
            name: "Synced Product",
            category: "Test",
            unit: "pcs",
            price: 25.00,
            quantity: 50,
          },
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checkpoint).toBeDefined();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].operationId).toBe(operationId);
    expect(body.results[0].status).toBe("success");
    expect(body.results[0].serverState?.id).toBe(operationId);

    const syncedProduct = await db.query.products.findFirst({
      where: eq(products.id, operationId),
    });
    expect(syncedProduct).toBeDefined();
    expect(syncedProduct?.name).toBe("Synced Product");
  });

  it("creates stock movement via sync with idempotency", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const operationId = crypto.randomUUID();
    const idempotencyKey = `idem-${operationId}`;
    
    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{
          operationId,
          idempotencyKey: operationId,
          entityId: crypto.randomUUID(),
          entityType: "stockMovement",
          operationType: "create",
          tenantId,
          payload: {
            tenantId,
            productId,
            type: "entry",
            quantity: 100,
            idempotencyKey,
          },
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.results[0].status).toBe("success");

    const movements = await db.query.stockMovements.findMany({
      where: eq(stockMovements.idempotencyKey, idempotencyKey),
    });
    expect(movements).toHaveLength(1);

    const request2 = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{
          operationId,
          idempotencyKey: operationId,
          entityId: crypto.randomUUID(),
          entityType: "stockMovement",
          operationType: "create",
          tenantId,
          payload: {
            tenantId,
            productId,
            type: "entry",
            quantity: 100,
            idempotencyKey,
          },
        }],
      }),
    });

    const response2 = await POST(request2);
    const body2 = await response2.json();
    expect(body2.results[0].status).toBe("duplicate");

    const movementsAfter = await db.query.stockMovements.findMany({
      where: eq(stockMovements.idempotencyKey, idempotencyKey),
    });
    expect(movementsAfter).toHaveLength(1);
  });

  it("returns validation error for invalid request", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns not_found for missing product on movement create", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const nonExistentProductId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    
    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{
          operationId,
          idempotencyKey: operationId,
          entityId: crypto.randomUUID(),
          entityType: "stockMovement",
          operationType: "create",
          tenantId,
          payload: {
            tenantId,
            productId: nonExistentProductId,
            type: "entry",
            quantity: 50,
          },
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.results[0].status).toBe("not_found");
    expect(body.results[0].message).toContain("Product not found");
  });

  it("returns conflict_resolved for stale product updates and includes authoritative serverState", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession(userId, `test-${userId}@example.com`, tenantId));

    const operationId = crypto.randomUUID();
    const request = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        operations: [{
          operationId,
          idempotencyKey: operationId,
          entityId: productId,
          entityType: "product",
          operationType: "update",
          tenantId,
          payload: {
            tenantId,
            clientUpdatedAt: "2000-01-01T00:00:00.000Z",
            updatedFields: {
              name: "Stale Local Name",
            },
          },
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.results[0].status).toBe("conflict_resolved");
    expect(body.results[0].serverState?.id).toBe(productId);
    expect(body.results[0].serverState?.name).toContain("Test Product");
  });
});
