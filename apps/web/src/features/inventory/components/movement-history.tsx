"use client";

import { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useStockMovements, type SyncStatus } from "../hooks/use-stock-movements";

interface MovementHistoryProps {
  productId: string;
  tenantId: string;
  productName?: string;
}

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  if (status === "synced") {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case "pending":
        return {
          label: "Pending sync",
          bgColor: "bg-amber-100",
          textColor: "text-amber-800",
          borderColor: "border-amber-200",
          icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case "processing":
        return {
          label: "Syncing",
          bgColor: "bg-blue-100",
          textColor: "text-blue-800",
          borderColor: "border-blue-200",
          icon: (
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ),
        };
      case "failed":
        return {
          label: "Sync failed",
          bgColor: "bg-red-100",
          textColor: "text-red-800",
          borderColor: "border-red-200",
          icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor} ${config.borderColor}`}
      role="status"
      aria-label={config.label}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
}

function MovementRow({
  movement,
}: {
  movement: {
    id: string;
    type: "entry" | "exit";
    quantity: number;
    createdAt: string;
    syncStatus: SyncStatus;
  };
}) {
  const isEntry = movement.type === "entry";
  const formattedDate = new Date(movement.createdAt).toLocaleString();

  return (
    <li
      className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0"
      role="listitem"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isEntry ? "bg-green-100" : "bg-red-100"
          }`}
          aria-hidden="true"
        >
          {isEntry ? (
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isEntry ? "text-green-700" : "text-red-700"}`}>
              {isEntry ? "+" : "-"}
              {movement.quantity}
            </span>
            <span className="text-sm text-gray-600">
              {isEntry ? "Stock Entry" : "Stock Exit"}
            </span>
          </div>
          <time className="text-xs text-gray-500" dateTime={movement.createdAt}>
            {formattedDate}
          </time>
        </div>
      </div>
      <SyncStatusBadge status={movement.syncStatus} />
    </li>
  );
}

function EmptyState({ productId }: { productId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <h3 className="mb-1 text-lg font-medium text-gray-900">No Movement History</h3>
      <p className="mb-4 text-sm text-gray-500">
        This product has no stock movements recorded yet.
      </p>
      <Link
        href={`/inventory?productId=${productId}`}
        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Record Stock Movement
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <ul className="divide-y divide-gray-100" aria-label="Loading movements">
      {[1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="flex items-center gap-4 py-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
          <div className="flex-1">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MovementHistory({ productId, tenantId, productName }: MovementHistoryProps) {
  const { movements, isLoading, isLoadingMore, hasMore, loadMore, isEmpty } = useStockMovements({
    productId,
    tenantId,
    pageSize: 20,
  });

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !isLoadingMore) {
        loadMore();
      }
    },
    [hasMore, isLoadingMore, loadMore]
  );

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "100px",
      threshold: 0,
    };

    observerRef.current = new IntersectionObserver(handleObserver, option);

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleObserver]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <LoadingSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <EmptyState productId={productId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {productName && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Movement History</h2>
            <p className="text-sm text-gray-500">{productName}</p>
          </div>
          <Link
            href={`/inventory?productId=${productId}`}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Record Movement
          </Link>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <ul
          className="divide-y divide-gray-100 p-4"
          role="list"
          aria-label="Stock movement history"
        >
          {movements.map((movement) => (
            <MovementRow key={movement.id} movement={movement} />
          ))}
        </ul>

        {hasMore && (
          <div
            ref={loadMoreRef}
            className="flex items-center justify-center border-t border-gray-100 py-4"
            aria-live="polite"
          >
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading more...</span>
              </div>
            ) : (
              <div className="h-8" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
