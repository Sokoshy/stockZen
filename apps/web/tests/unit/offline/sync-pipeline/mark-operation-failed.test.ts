import { beforeEach, describe, expect, it, vi } from "vitest";

import { markOperationFailed } from "~/features/offline/sync-pipeline";

/**
 * Unit test for `markOperationFailed`. The previous implementation
 * silently fell back to status="failed" when maxRetries was undefined,
 * which masked the terminal/permanently_failed boundary. The new
 * signature requires maxRetries (compile-time guard, A1) and this test
 * pins the boundary behaviour:
 *
 *   - nextRetryCount <  maxRetries => status "failed"
 *   - nextRetryCount >= maxRetries => status "permanently_failed"
 *
 * We mock db.outbox.get/update and let the real markOperationFailed
 * function compute the next state.
 */
const outboxStore = vi.hoisted(() => {
  const ops = new Map<string, {
    id: string;
    operationId: string;
    status: string;
    retryCount: number;
    error: string | null;
    processedAt: string | null;
  }>();
  return {
    ops,
    get: vi.fn(async (id: string) => ops.get(id) ?? undefined),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const existing = ops.get(id);
      if (!existing) return 0;
      ops.set(id, { ...existing, ...patch } as typeof existing);
      return 1;
    }),
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    outbox: {
      get: outboxStore.get,
      update: outboxStore.update,
    },
  },
}));

describe("markOperationFailed (PR #15 A1)", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    outboxStore.get.mockClear();
    outboxStore.update.mockClear();
  });

  it("sets status to 'failed' when below the retry threshold", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "processing",
      retryCount: 1,
      error: null,
      processedAt: null,
    });

    await markOperationFailed("op-1", "Network blip", 5);

    const updated = outboxStore.ops.get("op-1");
    expect(updated?.status).toBe("failed");
    expect(updated?.retryCount).toBe(2);
    expect(updated?.error).toBe("Network blip");
    expect(updated?.processedAt).not.toBeNull();
  });

  it("sets status to 'permanently_failed' when nextRetryCount >= maxRetries", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "failed",
      retryCount: 4,
      error: "Previous error",
      processedAt: null,
    });

    await markOperationFailed("op-1", "Server 500", 5);

    const updated = outboxStore.ops.get("op-1");
    expect(updated?.status).toBe("permanently_failed");
    expect(updated?.retryCount).toBe(5);
    expect(updated?.error).toBe("Server 500");
  });

  it("uses the just-completed attempt when computing nextRetryCount", async () => {
    outboxStore.ops.set("op-1", {
      id: "op-1",
      operationId: "op-1",
      status: "failed",
      retryCount: 0,
      error: null,
      processedAt: null,
    });

    await markOperationFailed("op-1", "boom", 1);

    const updated = outboxStore.ops.get("op-1");
    // 0 + 1 = 1, which is >= 1 (maxRetries), so terminal.
    expect(updated?.status).toBe("permanently_failed");
    expect(updated?.retryCount).toBe(1);
  });

  it("does nothing when the operation does not exist", async () => {
    await markOperationFailed("missing", "whatever", 5);
    expect(outboxStore.update).not.toHaveBeenCalled();
  });
});
