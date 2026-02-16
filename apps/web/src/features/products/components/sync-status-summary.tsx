"use client";

import { useEffect, useState } from "react";
import { db, type OutboxOperation } from "~/features/offline/database";

interface SyncStatusSummaryProps {
  tenantId: string;
}

export function SyncStatusSummary({ tenantId }: SyncStatusSummaryProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const countPendingOperations = async () => {
      try {
        const allOperations = await db.outbox
          .where("status")
          .anyOf(["pending", "failed"])
          .toArray();

        const operations = allOperations.filter((op) => {
          const tenantIdInPayload = (op.payload as { tenantId?: unknown }).tenantId;
          return typeof tenantIdInPayload === "string" && tenantIdInPayload === tenantId;
        });

        const pending = operations.filter(
          (op: OutboxOperation) => op.status === "pending"
        ).length;
        const failed = operations.filter(
          (op: OutboxOperation) => op.status === "failed"
        ).length;

        if (!cancelled) {
          setPendingCount(pending);
          setFailedCount(failed);
        }
      } catch {
        if (!cancelled) {
          setPendingCount(0);
          setFailedCount(0);
        }
      }
    };

    void countPendingOperations();

    const interval = setInterval(countPendingOperations, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tenantId]);

  if (pendingCount === 0 && failedCount === 0) {
    return null;
  }

  const getStatusMessage = () => {
    if (failedCount > 0 && pendingCount > 0) {
      return `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending, ${failedCount} failed`;
    }
    if (failedCount > 0) {
      return `${failedCount} sync failure${failedCount === 1 ? "" : "s"}`;
    }
    return `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending sync`;
  };

  const getStatusClasses = () => {
    if (failedCount > 0) {
      return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  return (
    <div
      className={`rounded-md border px-4 py-3 ${getStatusClasses()}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
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
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="text-sm font-medium">{getStatusMessage()}</span>
      </div>
    </div>
  );
}
