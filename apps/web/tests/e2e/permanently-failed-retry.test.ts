// TODO(playwright): convert to real browser test — see C8 brief
// This file is currently a Vitest unit test that mocks Dexie, fetch,
// and window. It is NOT a real Playwright E2E test. PR #15 step C8
// called for a real browser-driven spec, but the project has no
// working Playwright setup: every other file under tests/e2e/ is also
// a Vitest-mislabeled .test.ts file, and the only real .spec.ts
// (example.spec.ts) uses page.setContent to inject inline HTML rather
// than driving the actual /products page. Until a real Playwright
// harness exists for the offline-sync surfaces (and the routes they
// live on, like /api/sync, are covered by a dev server fixture), the
// scenario coverage in this file lives as a fast Vitest unit test.
// See PR #15 review notes — C8 — for the deferral rationale.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dismissPermanentlyFailedOperation,
  getPermanentlyFailedOperations,
  retryPermanentlyFailedOperation,
} from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

/**
 * E2E: the permanently-failed retry UX. PR #15 phase C8.
 *
 * Two scenarios:
 *  1. Force a permanently_failed op, then mock the server to return
 *     200. Retry. Assert: the op disappears from the list, the local
 *     entity is preserved, the server received the request.
 *  2. Force a permanently_failed op, retry while the server still
 *     returns 500. Assert: the outbox row is deleted AND the local
 *     entity is removed.
 *  3. Dismiss path: op in permanently_failed -> outbox row DELETED,
 *     local entity cleaned up, NO sync triggered.
 */
const hoisted = vi.hoisted(() => {
  const products = new Map<string, {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    sku: string | null;
    category: string | null;
    unit: string | null;
    barcode: string | null;
    price: number;
    purchasePrice: number | null;
    quantity: number;
    lowStockThreshold: number | null;
    customCriticalThreshold: number | null;
    customAttentionThreshold: number | null;
    syncStatus: "pending" | "synced" | "failed";
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }>();
  const outbox = new Map<string, OutboxOperation & { tenantId: string }>();
  let isOnline = true;

  function productsWhere(field: string) {
    return {
      equals(value: unknown) {
        const base = Array.from(products.values()).filter(
          (item) => (item as Record<string, unknown>)[field] === value
        );
        return {
          toArray: async () => base,
          first: async () => base[0],
        };
      },
    };
  }

  function outboxWhere(index: string) {
    return {
      equals(value: [string, string]) {
        const [tenantId, status] = value;
        const base = Array.from(outbox.values()).filter((op) => {
          if (index === "[tenantId+status]") {
            return op.tenantId === tenantId && op.status === status;
          }
          return false;
        });
        return {
          toArray: async () => base,
          count: async () => base.length,
        };
      },
    };
  }

  return {
    products,
    outbox,
    get isOnline() {
      return isOnline;
    },
    setOnline(value: boolean) {
      isOnline = value;
    },
    reset() {
      products.clear();
      outbox.clear();
      isOnline = true;
    },
    productsWhere,
    outboxWhere,
  };
});

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("navigator", {
  get onLine() {
    return hoisted.isOnline;
  },
});

const eventListeners = new Map<string, Set<() => void>>();
vi.stubGlobal("window", {
  addEventListener: (event: string, callback: () => void) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(callback);
  },
  removeEventListener: (event: string, callback: () => void) => {
    eventListeners.get(event)?.delete(callback);
  },
  setInterval: vi.fn(() => 123),
  clearInterval: vi.fn(),
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      return callback();
    },
    products: {
      get: async (id: string) => hoisted.products.get(id),
      add: async (product: {
        id: string;
        tenantId: string;
        name: string;
        description: string | null;
        sku: string | null;
        category: string | null;
        unit: string | null;
        barcode: string | null;
        price: number;
        purchasePrice: number | null;
        quantity: number;
        lowStockThreshold: number | null;
        customCriticalThreshold: number | null;
        customAttentionThreshold: number | null;
        syncStatus: "pending" | "synced" | "failed";
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
      }) => {
        hoisted.products.set(product.id, product);
      },
      put: async (product: {
        id: string;
        tenantId: string;
        name: string;
        description: string | null;
        sku: string | null;
        category: string | null;
        unit: string | null;
        barcode: string | null;
        price: number;
        purchasePrice: number | null;
        quantity: number;
        lowStockThreshold: number | null;
        customCriticalThreshold: number | null;
        customAttentionThreshold: number | null;
        syncStatus: "pending" | "synced" | "failed";
        createdAt: string;
        updatedAt: string;
        deletedAt: string | null;
      }) => {
        hoisted.products.set(product.id, product);
      },
      update: async (
        id: string,
        patch: Partial<{
          id: string;
          tenantId: string;
          name: string;
          description: string | null;
          sku: string | null;
          category: string | null;
          unit: string | null;
          barcode: string | null;
          price: number;
          purchasePrice: number | null;
          quantity: number;
          lowStockThreshold: number | null;
          customCriticalThreshold: number | null;
          customAttentionThreshold: number | null;
          syncStatus: "pending" | "synced" | "failed";
          createdAt: string;
          updatedAt: string;
          deletedAt: string | null;
        }>
      ) => {
        const existing = hoisted.products.get(id);
        if (!existing) return;
        const next = { ...existing, ...patch };
        hoisted.products.set(id, next);
      },
      delete: async (id: string) => {
        hoisted.products.delete(id);
      },
      where: hoisted.productsWhere,
    },
    outbox: {
      toArray: async () => Array.from(hoisted.outbox.values()),
      get: async (id: string) => hoisted.outbox.get(id),
      add: async (op: OutboxOperation & { tenantId: string }) => {
        hoisted.outbox.set(op.id, op);
      },
      update: async (
        id: string,
        patch: Partial<OutboxOperation> & Record<string, unknown>
      ) => {
        const existing = hoisted.outbox.get(id);
        if (!existing) return 0;
        const next: Record<string, unknown> = { ...existing };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) {
            delete next[k];
          } else {
            next[k] = v;
          }
        }
        hoisted.outbox.set(
          id,
          next as unknown as OutboxOperation & { tenantId: string }
        );
        return 1;
      },
      delete: async (id: string) => {
        hoisted.outbox.delete(id);
        return 1;
      },
      where: hoisted.outboxWhere,
    },
  },
}));

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const baseProduct = {
  id: "product-1",
  tenantId: TENANT_ID,
  name: "Flour",
  description: null,
  sku: null,
  category: "Baking",
  unit: "kg",
  barcode: null,
  price: 12,
  purchasePrice: null,
  quantity: 5,
  lowStockThreshold: null,
  customCriticalThreshold: null,
  customAttentionThreshold: null,
  syncStatus: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const baseOp: OutboxOperation & { tenantId: string } = {
  id: "op-1",
  operationId: "op-1",
  operationType: "create",
  entityType: "product",
  entityId: "product-1",
  tenantId: TENANT_ID,
  payload: {
    tenantId: TENANT_ID,
    operationId: "op-1",
    name: "Flour",
    category: "Baking",
    unit: "kg",
    price: 12,
  },
  status: "permanently_failed",
  retryCount: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  processedAt: "2026-01-01T00:00:01.000Z",
  error: "Server returned 500: invalid request",
};

function mockServerSuccess() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      checkpoint: "2026-01-01T00:00:02.000Z",
      results: [
        {
          operationId: "op-1",
          status: "success",
          serverState: { id: "product-1", name: "Flour" },
        },
      ],
    }),
  });
}

function mockServerValidationError() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      checkpoint: "2026-01-01T00:00:02.000Z",
      results: [
        {
          operationId: "op-1",
          status: "validation_error",
          message: "Invalid product",
        },
      ],
    }),
  });
}

describe("E2E - Permanently failed retry (PR #15 C8)", () => {
  beforeEach(() => {
    hoisted.reset();
    mockFetch.mockReset();
    eventListeners.clear();
    hoisted.products.set(baseProduct.id, { ...baseProduct });
    hoisted.outbox.set(baseOp.id, { ...baseOp });
  });

  afterEach(() => {
    eventListeners.clear();
  });

  it("scenario 1: retry with a healthy server -> op completed, local entity preserved", async () => {
    mockServerSuccess();

    const result = await retryPermanentlyFailedOperation("op-1", TENANT_ID);

    expect(result.outcome).toBe("completed");
    expect(hoisted.outbox.has("op-1")).toBe(true);
    const op = hoisted.outbox.get("op-1");
    expect(op?.status).toBe("completed");
    // Local product is preserved (the create was accepted by the server).
    expect(hoisted.products.has("product-1")).toBe(true);
    // The server received the request.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/sync");
    const body = JSON.parse(call[1].body);
    expect(body.operations).toHaveLength(1);
    expect(body.operations[0].operationId).toBe("op-1");
  });

  it("scenario 2: retry with a still-broken server -> outbox deleted + local entity removed", async () => {
    mockServerValidationError();

    const result = await retryPermanentlyFailedOperation("op-1", TENANT_ID);

    expect(result.outcome).toBe("deleted");
    expect(hoisted.outbox.has("op-1")).toBe(false);
    // The local product (a 'create' that never reached the server) is hard-deleted.
    expect(hoisted.products.has("product-1")).toBe(false);

    // The list is now empty.
    const remaining = await getPermanentlyFailedOperations(TENANT_ID);
    expect(remaining).toHaveLength(0);
  });

  it("scenario 3: dismiss -> outbox deleted + local entity cleaned up, no sync triggered", async () => {
    await dismissPermanentlyFailedOperation("op-1", TENANT_ID);

    expect(hoisted.outbox.has("op-1")).toBe(false);
    expect(hoisted.products.has("product-1")).toBe(false);
    // No fetch was triggered.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retry guard: throws when the op is in a different status", async () => {
    hoisted.outbox.set("op-1", { ...baseOp, status: "pending" });
    await expect(retryPermanentlyFailedOperation("op-1", TENANT_ID)).rejects.toThrow(
      /expected "permanently_failed"/
    );
  });

  it("the permanently-failed list reflects ops in the right tenant only", async () => {
    // Add an op for a different tenant that should not appear.
    hoisted.outbox.set("op-other-tenant", {
      ...baseOp,
      id: "op-other-tenant",
      operationId: "op-other-tenant",
      tenantId: "00000000-0000-0000-0000-000000000099",
    });

    const list = await getPermanentlyFailedOperations(TENANT_ID);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("op-1");
  });
});
