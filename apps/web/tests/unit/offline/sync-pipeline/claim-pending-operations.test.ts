import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimPendingOperations } from "~/features/offline/sync-pipeline";

/**
 * PR #15 review (A3): assert that the atomic claim is actually atomic
 * across concurrent callers. We simulate "two tabs" by handing the
 * mocked db the same store and racing two `claimPendingOperations`
 * invocations.
 *
 * The expected invariant: each pending row is claimed at most once
 * (i.e. assigned to one caller), and the underlying db update is
 * called once per row. This is the same property that the Dexie
 * transaction provides in production.
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
    /** Simulated Dexie composite key lookup. */
    getIndexedRows: (tenantId: string, status: string) => {
      const all = Array.from(ops.values());
      return all.filter(
        (op) =>
          (op.tenantId === tenantId || !op.tenantId) &&
          op.status === status &&
          // The "indexed" lookup skips rows that lack a tenantId.
          (op.tenantId === tenantId)
      );
    },
  };
});

const buildDb = () => {
  return {
    outbox: {
      toArray: outboxStore.toArray,
      update: outboxStore.update,
      where: vi.fn((index: string) => {
        return {
          equals: vi.fn((value: [string, string]) => {
            const [tenantId, status] = value;
            const rows =
              index === "[tenantId+status]"
                ? outboxStore.getIndexedRows(tenantId, status)
                : [];
            return {
              toArray: vi.fn(async () => rows),
              count: vi.fn(async () => rows.length),
            };
          }),
        };
      }),
    },
  };
};

// We need each test to build a fresh "transaction" boundary. The real
// Dexie transaction serialises body execution; the mock just runs the
// callback. We model that by acquiring a queue-style lock.
const locks = vi.hoisted(() => {
  let locked = false;
  const waiters: Array<() => void> = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      while (locked) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      locked = true;
      try {
        return await fn();
      } finally {
        locked = false;
        const next = waiters.shift();
        next?.();
      }
    },
    reset() {
      locked = false;
      waiters.length = 0;
    },
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<unknown>;
      return locks.run(callback);
    }),
    outbox: (() => {
      const build = () => {
        const wrap = {
          toArray: outboxStore.toArray,
          update: outboxStore.update,
          where: vi.fn((index: string) => ({
            equals: vi.fn((value: [string, string]) => {
              const [tenantId, status] = value;
              const rows =
                index === "[tenantId+status]"
                  ? outboxStore.getIndexedRows(tenantId, status)
                  : [];
              return {
                toArray: vi.fn(async () => rows),
                count: vi.fn(async () => rows.length),
              };
            }),
          })),
        };
        return wrap;
      };
      // Return a proxy that always returns a fresh wrapper so each
      // `db.outbox.where(...)` call gets the same underlying mocks
      // (vi.fn instance) but never collides with the other table
      // references used elsewhere in the file.
      return build();
    })(),
  },
}));

describe("claimPendingOperations (PR #15 A3 / multi-tab atomicity)", () => {
  const tenantId = "tenant-claim-1";
  const maxRetries = 5;
  const baseRetryDelayMs = 1000;
  const maxRetryDelayMs = 60000;

  beforeEach(() => {
    outboxStore.ops.clear();
    outboxStore.toArray.mockClear();
    outboxStore.update.mockClear();
    locks.reset();
  });

  it("two concurrent claims each return a disjoint set of pending ops", async () => {
    for (let i = 0; i < 4; i += 1) {
      outboxStore.ops.set(`op-${i}`, {
        id: `op-${i}`,
        operationId: `op-${i}`,
        tenantId,
        status: "pending",
        retryCount: 0,
        processedAt: null,
      });
    }

    const [a, b] = await Promise.all([
      claimPendingOperations(tenantId, maxRetries, baseRetryDelayMs, maxRetryDelayMs),
      claimPendingOperations(tenantId, maxRetries, baseRetryDelayMs, maxRetryDelayMs),
    ]);

    const aIds = a.map((op) => op.id).sort();
    const bIds = b.map((op) => op.id).sort();
    const overlap = aIds.filter((id) => bIds.includes(id));

    // No op is claimed by both callers.
    expect(overlap).toEqual([]);
    // Together they cover all four ops exactly once.
    expect([...aIds, ...bIds].sort()).toEqual(["op-0", "op-1", "op-2", "op-3"]);
    // After the claims, all rows are flipped to "processing".
    for (const op of outboxStore.ops.values()) {
      expect(op.status).toBe("processing");
    }
  });

  it("a 'failed' op within its retry budget is re-claimable on the next call", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      tenantId,
      status: "failed",
      retryCount: 1,
      processedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const claimed = await claimPendingOperations(
      tenantId,
      maxRetries,
      baseRetryDelayMs,
      maxRetryDelayMs
    );

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe("op-1");
  });

  it("a 'failed' op with retryCount >= maxRetries is NOT re-claimable", async () => {
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
      baseRetryDelayMs,
      maxRetryDelayMs
    );

    expect(claimed).toEqual([]);
  });

  it("ops for a different tenant are filtered out", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      tenantId: "tenant-a",
      status: "pending",
      retryCount: 0,
      processedAt: null,
    });
    outboxStore.ops.set("op-2", {
      id: "op-2",
      operationId: "op-2",
      tenantId,
      status: "pending",
      retryCount: 0,
      processedAt: null,
    });

    const claimed = await claimPendingOperations(
      tenantId,
      maxRetries,
      baseRetryDelayMs,
      maxRetryDelayMs
    );

    expect(claimed.map((op) => op.id)).toEqual(["op-2"]);
  });
});
