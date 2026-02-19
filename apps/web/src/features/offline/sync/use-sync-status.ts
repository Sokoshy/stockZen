"use client";

import { useEffect, useState, useCallback } from "react";
import {
  acquireSyncEngine,
  releaseSyncEngine,
  type SyncEngineState,
  type SyncState,
  type SyncEngine,
  type SyncEngineConfig,
} from "./sync-engine";

export interface UseSyncStatusOptions {
  tenantId: string;
  autoStart?: boolean;
  syncIntervalMs?: number;
}

export interface UseSyncStatusReturn {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  isOffline: boolean;
  hasError: boolean;
  isUpToDate: boolean;
  sync: () => Promise<void>;
  statusText: string;
  statusIcon: "sync" | "check" | "cloud-off" | "alert-circle";
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

  useEffect(() => {
    const config: SyncEngineConfig = {
      tenantId,
      syncIntervalMs,
    };

    const syncEngine = acquireSyncEngine(config);
    setEngine(syncEngine);

    const unsubscribe = syncEngine.subscribe(setSyncState);

    if (autoStart) {
      void syncEngine.start();
    }

    return () => {
      unsubscribe();
      releaseSyncEngine(tenantId);
    };
  }, [tenantId, autoStart, syncIntervalMs]);

  const sync = useCallback(async () => {
    if (engine) {
      await engine.sync();
    }
  }, [engine]);

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
    lastSyncAt: syncState.lastSyncAt,
    lastError: syncState.lastError,
    isSyncing,
    isOffline,
    hasError,
    isUpToDate,
    sync,
    statusText: getStatusText(),
    statusIcon: getStatusIcon(),
  };
}
