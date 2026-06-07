import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingOperations,
  getPendingOperations,
  getPermanentlyFailedOperations,
} from "~/features/offline/sync-pipeline";
import type { OutboxOperation } from "~/features/offline/database";

const createOp = (
  id: string,
  tenantId: string,
  status: OutboxOperation["status"],
  entityType: OutboxOperation["entityType"] = "product"
): OutboxOperation => ({
  id,
  operationId: id,
  operationType: "create",
  entityType,
  entityId: `entity-${id}`,
  tenantId,
  status,
  retryCount: 0,
  payload: { tenantId },
  createdAt: new Date().toISOString(),
  processedAt: null,
  error: null,
});

const outboxStore = vi.hoisted(() => {
  const ops = new Map<string, OutboxOperation>();
  return {
    ops,
    toArray: vi.fn(async () => Array.from(ops.values())),
    where: vi.fn((index: string) => ({
      equals: vi.fn((value: [string, string]) => {
        const [tenantId, status] = value;
        const rows = Array.from(ops.values()).filter(
          (op) => op.tenantId === tenantId && op.status === status
        );
        return {
          toArray: vi.fn(async () => rows),
        };
      }),
    })),
  };
});

vi.mock("~/features/offline/database", () => ({
  db: {
    transaction: vi.fn(async (...args: any[]) => {
      const fn = args[args.length - 1];
      return fn();
    }),
    outbox: {
      toArray: outboxStore.toArray,
      where: outboxStore.where,
    },
  },
}));

describe("empty outbox edge cases", () => {
  beforeEach(() => {
    outboxStore.ops.clear();
    vi.clearAllMocks();
  });

  describe("claimPendingOperations with empty outbox", () => {
    it("should return empty array when outbox is empty", async () => {
      const result = await claimPendingOperations(TENANT_ID, 5, 1000, 30000);
      expect(result).toEqual([]);
    });
  });

  describe("getPendingOperations with various states", () => {
    it("should return empty array when all operations are permanently_failed", async () => {
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "permanently_failed"));
      outboxStore.ops.set("op-2", createOp("op-2", TENANT_ID, "permanently_failed"));
      outboxStore.ops.set("op-3", createOp("op-3", TENANT_ID, "permanently_failed"));

      const result = await getPendingOperations(TENANT_ID);
      expect(result).toEqual([]);
    });

    it("should return only pending and failed operations for the tenant", async () => {
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "pending"));
      outboxStore.ops.set("op-2", createOp("op-2", TENANT_ID, "failed"));
      outboxStore.ops.set("op-3", createOp("op-3", TENANT_ID, "processing"));
      outboxStore.ops.set("op-4", createOp("op-4", TENANT_ID, "completed"));
      outboxStore.ops.set("op-5", createOp("op-5", TENANT_ID, "permanently_failed"));

      const result = await getPendingOperations(TENANT_ID);
      expect(result).toHaveLength(2);
      expect(result.map((op) => op.id).sort()).toEqual(["op-1", "op-2"]);
    });

    it("should not return operations from other tenants", async () => {
      const otherTenantId = "00000000-0000-0000-0000-000000000002";
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "pending"));
      outboxStore.ops.set("op-2", createOp("op-2", otherTenantId, "pending"));
      outboxStore.ops.set("op-3", createOp("op-3", otherTenantId, "failed"));

      const result = await getPendingOperations(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("op-1");
    });

    it("should return empty array for tenant with no operations", async () => {
      const otherTenantId = "00000000-0000-0000-0000-000000000002";
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "pending"));
      outboxStore.ops.set("op-2", createOp("op-2", TENANT_ID, "failed"));

      const result = await getPendingOperations(otherTenantId);
      expect(result).toEqual([]);
    });
  });

  describe("getPermanentlyFailedOperations with empty outbox", () => {
    it("should return empty array when outbox is empty", async () => {
      const result = await getPermanentlyFailedOperations(TENANT_ID);
      expect(result).toEqual([]);
    });

    it("should return only permanently_failed operations for the tenant", async () => {
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "permanently_failed"));
      outboxStore.ops.set("op-2", createOp("op-2", TENANT_ID, "permanently_failed"));
      outboxStore.ops.set("op-3", createOp("op-3", TENANT_ID, "pending"));
      outboxStore.ops.set("op-4", createOp("op-4", "00000000-0000-0000-0000-000000000002", "permanently_failed"));

      const result = await getPermanentlyFailedOperations(TENANT_ID);
      expect(result).toHaveLength(2);
      expect(result.every((op) => op.tenantId === TENANT_ID)).toBe(true);
      expect(result.every((op) => op.status === "permanently_failed")).toBe(true);
    });

    it("should return empty array for tenant with no permanently_failed operations", async () => {
      outboxStore.ops.set("op-1", createOp("op-1", TENANT_ID, "pending"));
      outboxStore.ops.set("op-2", createOp("op-2", TENANT_ID, "failed"));

      const result = await getPermanentlyFailedOperations(TENANT_ID);
      expect(result).toEqual([]);
    });
  });
});

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
