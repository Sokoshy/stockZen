import { db, type OutboxOperation } from "../database";
import {
  markOperationCompleted,
  markOperationFailed,
  markOperationProcessing,
} from "../outbox";
import {
  updateProductSyncStatus,
  applyServerProductState,
} from "../product-operations";
import {
  markMovementSynced,
  markMovementSyncFailed,
} from "../movement-operations";
import type { SyncRequest, SyncResponse, SyncResult } from "~/schemas/sync";

export type SyncState = "offline" | "syncing" | "upToDate" | "error";

export interface SyncEngineConfig {
  tenantId: string;
  syncEndpoint?: string;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  syncIntervalMs?: number;
}

export interface SyncEngineState {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

type SyncStateListener = (state: SyncEngineState) => void;

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60000;
const DEFAULT_SYNC_INTERVAL_MS = 30000;

class SyncEngine {
  private tenantId: string;
  private syncEndpoint: string;
  private maxRetries: number;
  private baseRetryDelayMs: number;
  private maxRetryDelayMs: number;
  private syncIntervalMs: number;
  
  private currentState: SyncEngineState = {
    state: "offline",
    pendingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    lastError: null,
  };
  
  private listeners: Set<SyncStateListener> = new Set();
  private syncInProgress = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  constructor(config: SyncEngineConfig) {
    this.tenantId = config.tenantId;
    this.syncEndpoint = config.syncEndpoint ?? "/api/sync";
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    this.maxRetryDelayMs = config.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.syncIntervalMs = config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SyncEngineState {
    return { ...this.currentState };
  }

  private setState(updates: Partial<SyncEngineState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  async start(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    if (this.intervalId) {
      return;
    }

    const updateOnlineState = () => {
      if (navigator.onLine) {
        this.setState({ state: this.currentState.pendingCount > 0 ? "syncing" : "upToDate" });
        void this.sync();
      } else {
        this.setState({ state: "offline" });
      }
    };

    this.onlineListener = updateOnlineState;
    this.offlineListener = () => this.setState({ state: "offline" });

    window.addEventListener("online", this.onlineListener);
    window.addEventListener("offline", this.offlineListener);

    updateOnlineState();

    this.intervalId = setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        void this.sync();
      }
    }, this.syncIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (typeof window !== "undefined") {
      if (this.onlineListener) {
        window.removeEventListener("online", this.onlineListener);
      }
      if (this.offlineListener) {
        window.removeEventListener("offline", this.offlineListener);
      }
    }

    this.onlineListener = null;
    this.offlineListener = null;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async sync(): Promise<void> {
    if (this.syncInProgress) {
      return;
    }

    if (typeof window !== "undefined" && !navigator.onLine) {
      this.setState({ state: "offline" });
      return;
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    try {
      const pendingOps = await this.getPendingOperations();

      if (pendingOps.length === 0) {
        this.setState({
          state: "upToDate",
          pendingCount: 0,
          failedCount: await this.getFailedCount(),
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });
        return;
      }

      this.setState({
        state: "syncing",
        pendingCount: pendingOps.length,
      });

      await Promise.all(
        pendingOps.map((op) => markOperationProcessing(op.operationId))
      );

      const operations = pendingOps.map((op) => ({
        operationId: op.operationId,
        idempotencyKey: op.operationId,
        entityId: op.entityId,
        entityType: op.entityType,
        operationType: op.operationType,
        tenantId: (op.payload as { tenantId?: string }).tenantId ?? this.tenantId,
        payload: op.payload,
      }));

      const request: SyncRequest = {
        checkpoint: this.currentState.lastSyncAt ?? undefined,
        operations,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (operations.length === 1) {
        headers["Idempotency-Key"] = operations[0]!.operationId;
      }

      const response = await fetch(this.syncEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          await this.markOperationsForRetry("Rate limited. Will retry later.");
          this.setState({
            state: "error",
            lastError: "Rate limited. Will retry later.",
          });
          return;
        }
        throw new Error(`Sync failed with status ${response.status}`);
      }

      const syncResponse: SyncResponse = await response.json();
      await this.processSyncResults(pendingOps, syncResponse.results);

      const remainingPending = await this.getPendingCount();
      const remainingFailed = await this.getFailedCount();

      this.setState({
        state: remainingPending > 0 ? "syncing" : remainingFailed > 0 ? "error" : "upToDate",
        pendingCount: remainingPending,
        failedCount: remainingFailed,
        lastSyncAt: syncResponse.checkpoint,
        lastError: remainingFailed > 0 ? `${remainingFailed} operations failed` : null,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Sync failed";
      this.setState({
        state: "error",
        lastError: errorMessage,
      });

      await this.markOperationsForRetry(errorMessage);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  private async getPendingOperations(): Promise<OutboxOperation[]> {
    const now = Date.now();
    const allOps = await db.outbox.toArray();

    return allOps.filter((op) => {
      if (op.status !== "pending" && op.status !== "failed") {
        return false;
      }

      const opTenantId = (op.payload as { tenantId?: string }).tenantId;
      if (opTenantId !== this.tenantId) {
        return false;
      }

      if (op.status === "failed") {
        if (op.retryCount >= this.maxRetries) {
          return false;
        }

        if (!op.processedAt) {
          return true;
        }

        const lastAttemptAt = Date.parse(op.processedAt);
        if (Number.isNaN(lastAttemptAt)) {
          return true;
        }

        const retryDelay = this.calculateRetryDelay(Math.max(0, op.retryCount - 1));
        return now >= lastAttemptAt + retryDelay;
      }

      return true;
    });
  }

  private async getPendingCount(): Promise<number> {
    const ops = await this.getPendingOperations();
    return ops.filter((op) => op.status === "pending").length;
  }

  private async getFailedCount(): Promise<number> {
    const allOps = await db.outbox.toArray();
    return allOps.filter((op) => {
      const opTenantId = (op.payload as { tenantId?: string }).tenantId;
      return opTenantId === this.tenantId && op.status === "failed";
    }).length;
  }

  private async processSyncResults(
    operations: OutboxOperation[],
    results: SyncResult[]
  ): Promise<void> {
    const resultMap = new Map(results.map((r) => [r.operationId, r]));

    for (const op of operations) {
      const result = resultMap.get(op.operationId);
      if (!result) {
        await this.handlePermanentFailure(op, {
          operationId: op.operationId,
          status: "validation_error",
          message: "No sync result returned by server",
        });
        continue;
      }

      switch (result.status) {
        case "success":
        case "duplicate":
          await this.handleSuccess(op, result);
          break;
        case "conflict_resolved":
          await this.handleConflictResolved(op, result);
          break;
        case "validation_error":
        case "tenant_mismatch":
        case "not_found":
          await this.handlePermanentFailure(op, result);
          break;
        case "rate_limited":
          await this.handleRetryableFailure(op, result);
          break;
      }
    }
  }

  private async handleSuccess(op: OutboxOperation, result: SyncResult): Promise<void> {
    await markOperationCompleted(op.operationId, result.serverState?.id as string | undefined);

    if (op.entityType === "product") {
      await applyServerProductState(op.entityId, result.serverState);
      await updateProductSyncStatus(op.entityId, "synced");
    } else if (op.entityType === "stockMovement") {
      await markMovementSynced({
        movementId: op.entityId,
        operationId: op.operationId,
        serverMovementId: result.serverState?.id as string | undefined,
      });
    }
  }

  private async handleConflictResolved(op: OutboxOperation, result: SyncResult): Promise<void> {
    await markOperationCompleted(op.operationId);

    if (op.entityType === "product" && result.serverState) {
      await applyServerProductState(op.entityId, result.serverState);
      await updateProductSyncStatus(op.entityId, "synced");
    } else if (op.entityType === "stockMovement") {
      await markMovementSynced({
        movementId: op.entityId,
        operationId: op.operationId,
        serverMovementId: result.serverState?.id as string | undefined,
      });
    }
  }

  private async handlePermanentFailure(op: OutboxOperation, result: SyncResult): Promise<void> {
    await markOperationFailed(
      op.operationId,
      result.message ?? `Permanent failure: ${result.status}`
    );

    if (op.entityType === "product") {
      await updateProductSyncStatus(op.entityId, "failed");
    } else if (op.entityType === "stockMovement") {
      await markMovementSyncFailed({
        movementId: op.entityId,
        operationId: op.operationId,
        error: result.message ?? `Permanent failure: ${result.status}`,
      });
    }
  }

  private async handleRetryableFailure(op: OutboxOperation, result: SyncResult): Promise<void> {
    if (op.retryCount >= this.maxRetries) {
      await this.handlePermanentFailure(op, result);
      return;
    }

    await markOperationFailed(
      op.operationId,
      result.message ?? "Retryable failure, will retry"
    );
  }

  private async markOperationsForRetry(errorMessage: string): Promise<void> {
    const processingOps = await db.outbox
      .where("status")
      .equals("processing")
      .toArray();

    for (const op of processingOps) {
      const opTenantId = (op.payload as { tenantId?: string }).tenantId;
      if (opTenantId !== this.tenantId) {
        continue;
      }

      if (op.retryCount >= this.maxRetries) {
        await markOperationFailed(op.operationId, "Max retries exceeded");
      } else {
        await markOperationFailed(op.operationId, errorMessage);
      }
    }
  }

  calculateRetryDelay(retryCount: number): number {
    const delay = this.baseRetryDelayMs * Math.pow(2, retryCount);
    return Math.min(delay, this.maxRetryDelayMs);
  }
}

const syncEngineInstances = new Map<string, SyncEngine>();
const syncEngineRefCounts = new Map<string, number>();

export function getSyncEngine(config: SyncEngineConfig): SyncEngine {
  const existing = syncEngineInstances.get(config.tenantId);
  if (existing) {
    return existing;
  }

  const instance = new SyncEngine(config);
  syncEngineInstances.set(config.tenantId, instance);
  return instance;
}

export function acquireSyncEngine(config: SyncEngineConfig): SyncEngine {
  const engine = getSyncEngine(config);
  const count = syncEngineRefCounts.get(config.tenantId) ?? 0;
  syncEngineRefCounts.set(config.tenantId, count + 1);
  return engine;
}

export function releaseSyncEngine(tenantId: string): void {
  const count = syncEngineRefCounts.get(tenantId);
  if (!count) {
    return;
  }

  if (count <= 1) {
    syncEngineRefCounts.delete(tenantId);
    const engine = syncEngineInstances.get(tenantId);
    if (engine) {
      engine.stop();
      syncEngineInstances.delete(tenantId);
    }
    return;
  }

  syncEngineRefCounts.set(tenantId, count - 1);
}

export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  return new SyncEngine(config);
}

export type { SyncEngine };
