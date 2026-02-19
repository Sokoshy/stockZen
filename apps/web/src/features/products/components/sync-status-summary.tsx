"use client";

import { useSyncStatus } from "~/features/offline/sync/use-sync-status";

interface SyncStatusIndicatorProps {
  tenantId: string;
  showUpToDate?: boolean;
}

export function SyncStatusIndicator({ 
  tenantId,
  showUpToDate = true,
}: SyncStatusIndicatorProps) {
  const {
    state,
    statusText,
    statusIcon,
  } = useSyncStatus({ tenantId });

  if (state === "upToDate" && !showUpToDate) {
    return null;
  }

  const getStatusClasses = () => {
    switch (state) {
      case "syncing":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "upToDate":
        return "bg-green-50 text-green-700 border-green-200";
      case "offline":
        return "bg-gray-50 text-gray-700 border-gray-200";
      case "error":
        return "bg-red-50 text-red-700 border-red-200";
    }
  };

  const renderIcon = () => {
    switch (statusIcon) {
      case "sync":
        return (
          <svg
            className="h-5 w-5 flex-shrink-0 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      case "check":
        return (
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "cloud-off":
        return (
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        );
      case "alert-circle":
        return (
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
    }
  };

  return (
    <div
      className={`rounded-md border px-4 py-3 ${getStatusClasses()}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {renderIcon()}
        <span className="text-sm font-medium">{statusText}</span>
      </div>
    </div>
  );
}

export function SyncStatusSummary({ tenantId }: { tenantId: string }) {
  return <SyncStatusIndicator tenantId={tenantId} />;
}
