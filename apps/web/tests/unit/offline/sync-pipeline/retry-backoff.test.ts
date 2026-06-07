import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimPendingOperations } from "~/features/offline/sync-pipeline";

/**
 * PR #15 review (A3): the retry gate must be respected. A "failed" op
 * whose retry budget was just consumed (retryCount=2, lastErrorAt 1s
 * ago) must NOT be re-claimed in the next batch — the engine should
 * wait for the backoff window to elapse.
 */
const outboxStore = vi.hoisted(() => {
  type Row = {
    id: string;
    operationId: string;
    tenantId: string;
    status: string;
    retryCount: number;
    processedAt: string | null;
  };
  const ops = new Map<string, Row>();

  return {
    ops,
    toArray: vi.fn(async () => Array.from(ops.values())),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      ops.set(id, { ...existing, ...patch } as Row);
      return 1;
    }),
    getIndexedRows: (tenantId: string, status: string) =>
      Array.from(ops.values()).filter(
        (op) => op.tenantId === tenantId && op.status === status
      ),
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      return callback();
    }),
    outbox: {
      toArray: outboxStore.toArray,
      update: outboxStore.update,
      where: vi.fn(() => ({
        equals: vi.fn((value: [string, string]) => {
          const [tenantId, status] = value;
          return {
            toArray: vi.fn(async () =>
              outboxStore.getIndexedRows(tenantId, status)
            ),
            count: vi.fn(
              async () => outboxStore.getIndexedRows(tenantId, status).length
            ),
          };
        }),
      })),
    },
  },
}));

describe("claimPendingOperations — retry gate (PR #15 A3)", () => {
  const tenantId = "tenant-retry";
  const maxRetries = 5;

  beforeEach(() => {
    outboxStore.ops.clear();
    outboxStore.toArray.mockClear();
    outboxStore.update.mockClear();
  });

  it("does NOT claim a failed op whose backoff window has not elapsed", async () => {
    // retryCount=2, baseRetryDelayMs=1000, lastErrorAt=1s ago.
    // The gate uses retryCount-1 as the exponent → 1000 * 2^1 = 2000ms
    // window. 1s ago is too recent.
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      tenantId,
      status: "failed",
      retryCount: 2,
      processedAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const claimed = await claimPendingOperations(
      tenantId,
      maxRetries,
      1_000,
      60_000
    );

    expect(claimed.find((op) => op.id === "op-1")).toBeUndefined();
  });

  it("DOES claim a failed op whose backoff window HAS elapsed", async () => {
    // retryCount=2, baseRetryDelayMs=1000, lastErrorAt=10s ago.
    // 10s > 2s window, so the op is claimable again.
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      tenantId,
      status: "failed",
      retryCount: 2,
      processedAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const claimed = await claimPendingOperations(
      tenantId,
      maxRetries,
      1_000,
      60_000
    );

    expect(claimed.find((op) => op.id === "op-1")).toBeDefined();
  });

  it("does NOT claim a failed op whose retryCount has reached the max", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      tenantId,
      status: "failed",
      retryCount: 5,
      processedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const claimed = await claimPendingOperations(
      tenantId,
      maxRetries,
      1_000,
      60_000
    );

    expect(claimed).toEqual([]);
  });
});
