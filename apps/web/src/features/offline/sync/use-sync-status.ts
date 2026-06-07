"use client";

import { useEffect, useState, useCallback } from "react";
import {
  acquireSyncEngine,
  releaseSyncEngine,
  getPermanentlyFailedOperations,
  retryPermanentlyFailedOperation,
  dismissPermanentlyFailedOperation,
  type OutboxOperation,
  type SyncEngineState,
  type SyncState,
  type SyncEngine,
  type SyncEngineConfig,
  type RetryPermanentlyFailedResult,
} from "~/features/offline/sync-pipeline";

export interface UseSyncStatusOptions {
  tenantId: string;
  autoStart?: boolean;
  syncIntervalMs?: number;
}

export interface UseSyncStatusReturn {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  permanentlyFailedCount: number;
  permanentlyFailedOps: OutboxOperation[];
  lastSyncAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  isOffline: boolean;
  hasError: boolean;
  isUpToDate: boolean;
  sync: () => Promise<void>;
  statusText: string;
  statusIcon: "sync" | "check" | "cloud-off" | "alert-circle";
  retryFailed: (operationId: string) => Promise<RetryPermanentlyFailedResult>;
  dismissFailed: (operationId: string) => Promise<void>;
  refreshPermanentlyFailed: () => Promise<void>;
}

export function useSyncStatus(options: UseSyncStatusOptions): UseSyncStatusReturn {
  const { tenantId, autoStart = true, syncIntervalMs } = options;

  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [syncState, setSyncState] = useState<SyncEngineState>({
    state: "offline",
    pendingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    lastError: null,
  });
  const [permanentlyFailedOps, setPermanentlyFailedOps] = useState<
    OutboxOperation[]
  >([]);

  const refreshPermanentlyFailed = useCallback(async () => {
    try {
      const rows = await getPermanentlyFailedOperations(tenantId);
      setPermanentlyFailedOps(rows);
    } catch {
      setPermanentlyFailedOps([]);
    }
  }, [tenantId]);

  useEffect(() => {
    const config: SyncEngineConfig = {
      tenantId,
      syncIntervalMs,
    };

    const syncEngine = acquireSyncEngine(config);
    setEngine(syncEngine);

    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
    });

    if (autoStart) {
      void syncEngine.start();
    }

    return () => {
      unsubscribe();
      releaseSyncEngine(tenantId);
    };
  }, [tenantId, autoStart, syncIntervalMs]);

  // Refresh the permanently-failed list whenever the sync state changes
  // (state, pendingCount, failedCount, lastSyncAt) — i.e. after every
  // sync attempt that the engine reports. This is cheap because the
  // list is indexed.
  useEffect(() => {
    void refreshPermanentlyFailed();
  }, [
    refreshPermanentlyFailed,
    syncState.state,
    syncState.pendingCount,
    syncState.failedCount,
    syncState.lastSyncAt,
  ]);

  const sync = useCallback(async () => {
    if (engine) {
      await engine.sync();
    }
    await refreshPermanentlyFailed();
  }, [engine, refreshPermanentlyFailed]);

  const retryFailed = useCallback(
    async (operationId: string): Promise<RetryPermanentlyFailedResult> => {
      const result = await retryPermanentlyFailedOperation(operationId);
      await refreshPermanentlyFailed();
      return result;
    },
    [refreshPermanentlyFailed]
  );

  const dismissFailed = useCallback(
    async (operationId: string): Promise<void> => {
      await dismissPermanentlyFailedOperation(operationId);
      await refreshPermanentlyFailed();
    },
    [refreshPermanentlyFailed]
  );

  const isSyncing = syncState.state === "syncing";
  const isOffline = syncState.state === "offline";
  const hasError = syncState.state === "error";
  const isUpToDate = syncState.state === "upToDate";

  const getStatusText = (): string => {
    switch (syncState.state) {
      case "syncing":
        return syncState.pendingCount > 1
          ? `Syncing ${syncState.pendingCount} changes...`
          : "Syncing...";
      case "upToDate":
        return "Up to date";
      case "offline":
        return syncState.pendingCount > 0
          ? `Offline (${syncState.pendingCount} pending)`
          : "Offline";
      case "error":
        return syncState.failedCount > 0
          ? `${syncState.failedCount} sync error${syncState.failedCount > 1 ? "s" : ""}`
          : "Sync error";
    }
  };

  const getStatusIcon = (): "sync" | "check" | "cloud-off" | "alert-circle" => {
    switch (syncState.state) {
      case "syncing":
        return "sync";
      case "upToDate":
        return "check";
      case "offline":
        return "cloud-off";
      case "error":
        return "alert-circle";
    }
  };

  return {
    state: syncState.state,
    pendingCount: syncState.pendingCount,
    failedCount: syncState.failedCount,
    permanentlyFailedCount: permanentlyFailedOps.length,
    permanentlyFailedOps,
    lastSyncAt: syncState.lastSyncAt,
    lastError: syncState.lastError,
    isSyncing,
    isOffline,
    hasError,
    isUpToDate,
    sync,
    statusText: getStatusText(),
    statusIcon: getStatusIcon(),
    retryFailed,
    dismissFailed,
    refreshPermanentlyFailed,
  };
}
