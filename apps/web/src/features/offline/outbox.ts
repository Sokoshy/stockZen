import { db, type OutboxOperation } from "./database";

export interface EnqueueOperationInput {
  operationId?: string;
  operationType: "create" | "update" | "delete";
  entityType: "product";
  entityId: string;
  payload: Record<string, unknown>;
}

export async function enqueueOperation(input: EnqueueOperationInput): Promise<string> {
  const operationId = input.operationId ?? crypto.randomUUID();
  const now = new Date().toISOString();

  const operation: OutboxOperation = {
    id: operationId,
    operationId,
    operationType: input.operationType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: {
      ...input.payload,
      operationId,
    },
    status: "pending",
    retryCount: 0,
    createdAt: now,
    processedAt: null,
    error: null,
  };

  await db.outbox.add(operation);
  return operationId;
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  const all = await db.outbox.toArray();
  return all.filter((op) => op.status === "pending" || op.status === "failed");
}

export async function markOperationProcessing(operationId: string): Promise<void> {
  await db.outbox.update(operationId, {
    status: "processing",
  });
}

export async function markOperationCompleted(
  operationId: string,
  serverSyncedId?: string
): Promise<void> {
  await db.outbox.update(operationId, {
    status: "completed",
    processedAt: new Date().toISOString(),
  });

  if (serverSyncedId) {
    await db.outbox.update(operationId, {
      payload: { ...((await db.outbox.get(operationId))?.payload ?? {}), serverId: serverSyncedId },
    });
  }
}

export async function markOperationFailed(
  operationId: string,
  error: string
): Promise<void> {
  const operation = await db.outbox.get(operationId);
  if (!operation) return;

  await db.outbox.update(operationId, {
    status: "failed",
    retryCount: operation.retryCount + 1,
    error,
  });
}
