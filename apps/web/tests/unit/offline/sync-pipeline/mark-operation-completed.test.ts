import { beforeEach, describe, expect, it, vi } from "vitest";

import { markOperationCompleted } from "~/features/offline/sync-pipeline";

/**
 * PR #15 review (A3): markOperationCompleted must do its get+update
 * inside a single Dexie transaction, and the merged payload must be
 * persisted in one write. We mock db.transaction to assert both.
 */
const outboxStore = vi.hoisted(() => {
  type Row = {
    id: string;
    operationId: string;
    status: string;
    payload: Record<string, unknown>;
    processedAt: string | null;
    oneShotRetry?: boolean;
  };
  const ops = new Map<string, Row>();

  return {
    ops,
    get: vi.fn(async (id: string) => ops.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      // Mirror Dexie's update semantics: explicit `undefined` removes the key.
      const next: Record<string, unknown> = { ...existing };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
      }
      ops.set(id, next as unknown as Row);
      return 1;
    }),
  };
});

const transactionMock = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>;
    return callback();
  })
);

vi.mock("~/features/offline/database", () => ({
  db: {
    outbox: {
      get: outboxStore.get,
      update: outboxStore.update,
    },
    transaction: transactionMock,
  },
}));

describe("markOperationCompleted (PR #15 A3 / B1)", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    outboxStore.get.mockClear();
    outboxStore.update.mockClear();
    transactionMock.mockClear();
  });

  it("wraps the get+update in a single db.transaction", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "processing",
      payload: { tenantId: "t-1", name: "Flour" },
      processedAt: null,
    });

    await markOperationCompleted("op-1", "server-id-42");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledWith(
      "rw",
      expect.objectContaining({ update: outboxStore.update }),
      expect.any(Function)
    );
  });

  it("merges the serverId into the existing payload in a single update call", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "processing",
      payload: { tenantId: "t-1", name: "Flour", price: 12 },
      processedAt: null,
    });

    await markOperationCompleted("op-1", "server-id-42");

    expect(outboxStore.update).toHaveBeenCalledTimes(1);
    const callArgs = outboxStore.update.mock.calls[0]!;
    const patch = callArgs[1] as Record<string, unknown>;
    expect(patch.status).toBe("completed");
    expect(patch.processedAt).not.toBeNull();
    expect((patch.payload as Record<string, unknown>).serverId).toBe(
      "server-id-42"
    );
    expect((patch.payload as Record<string, unknown>).name).toBe("Flour");
    expect((patch.payload as Record<string, unknown>).price).toBe(12);
  });

  it("does not invoke the get path when no serverSyncedId is provided", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "processing",
      payload: { tenantId: "t-1" },
      processedAt: null,
    });

    await markOperationCompleted("op-1");

    expect(outboxStore.update).toHaveBeenCalledTimes(1);
    const patch = outboxStore.update.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.status).toBe("completed");
    // When no serverSyncedId is supplied, the patch must NOT carry a
    // payload field at all (the production code only sets payload when
    // it has something to merge).
    expect("payload" in patch ? patch.payload : undefined).toBeUndefined();
  });

  it("clears the oneShotRetry flag so a successful retry does not keep its transient marker", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "processing",
      payload: { tenantId: "t-1" },
      processedAt: null,
      oneShotRetry: true,
    });

    await markOperationCompleted("op-1", "server-id-9");

    const updated = outboxStore.ops.get("op-1");
    expect(updated).toBeDefined();
    expect((updated as unknown as { oneShotRetry?: boolean }).oneShotRetry).toBeUndefined();
  });
});
