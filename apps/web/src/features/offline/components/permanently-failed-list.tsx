"use client";

import { useState } from "react";

import { useSyncStatus } from "~/features/offline/sync/use-sync-status";
import type { OutboxOperation } from "~/features/offline/sync-pipeline";

interface PermanentlyFailedListProps {
  tenantId: string;
}

const MAX_ERROR_LENGTH = 140;

function truncate(value: string | null | undefined, max: number): string {
  if (!value) {
    return "Unknown error";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}\u2026`;
}

function describeOp(op: OutboxOperation): string {
  if (op.entityType === "product") {
    if (op.operationType === "delete") {
      return "Product deletion";
    }
    if (op.operationType === "update") {
      const original = (op.payload as { originalProduct?: { name?: string } })
        .originalProduct;
      return original?.name ? `Update: ${original.name}` : "Product update";
    }
    const name = (op.payload as { name?: string }).name;
    return name ? `New product: ${name}` : "New product";
  }
  if (op.entityType === "stockMovement") {
    const productId = (op.payload as { productId?: string }).productId;
    const type = (op.payload as { type?: string }).type;
    const quantity = (op.payload as { quantity?: number }).quantity;
    if (productId && type && typeof quantity === "number") {
      return `Stock ${type} (x${quantity})`;
    }
    return "Stock movement";
  }
  return "Operation";
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

export function PermanentlyFailedList({ tenantId }: PermanentlyFailedListProps) {
  const {
    permanentlyFailedCount,
    permanentlyFailedOps,
    retryFailed,
    dismissFailed,
  } = useSyncStatus({ tenantId });
  const [inflight, setInflight] = useState<Set<string>>(() => new Set());
  const [banner, setBanner] = useState<{ kind: "info" | "warn"; text: string } | null>(
    null
  );
  const [isExpanded, setIsExpanded] = useState(true);

  if (permanentlyFailedCount === 0) {
    return null;
  }

  const withInflight = (opId: string, action: () => Promise<void>) => async () => {
    if (inflight.has(opId)) {
      return;
    }
    setInflight((previous) => {
      const next = new Set(previous);
      next.add(opId);
      return next;
    });
    setBanner(null);
    try {
      await action();
    } finally {
      setInflight((previous) => {
        const next = new Set(previous);
        next.delete(opId);
        return next;
      });
    }
  };

  return (
    <section
      className="rounded-md border border-amber-200 bg-amber-50 p-4"
      aria-label="Permanently failed sync operations"
      data-testid="permanently-failed-list"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-amber-900">
            {permanentlyFailedCount} operation
            {permanentlyFailedCount === 1 ? "" : "s"} failed permanently
          </h2>
          <p className="text-xs text-amber-800">
            These could not be synced after multiple retries. You can retry once more or dismiss
            them \u2014 dismissing will remove the outbox entry and the local entity.
          </p>
        </div>

        <button
          type="button"
          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          aria-expanded={isExpanded}
          aria-controls="permanently-failed-rows"
          onClick={() => setIsExpanded((value) => !value)}
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </header>

      {banner ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            banner.kind === "warn"
              ? "border-amber-300 bg-amber-100 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {banner.text}
        </div>
      ) : null}

      {isExpanded ? (
        <ul id="permanently-failed-rows" className="mt-3 space-y-2">
          {permanentlyFailedOps.map((op) => {
            const isBusy = inflight.has(op.id);
            return (
              <li
                key={op.id}
                className="rounded-md border border-amber-200 bg-white p-3"
                data-testid={`permanently-failed-row-${op.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {describeOp(op)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTimestamp(op.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-red-700">
                      {truncate(op.error, MAX_ERROR_LENGTH)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      disabled={isBusy}
                      data-testid={`permanently-failed-retry-${op.id}`}
                      onClick={withInflight(op.id, async () => {
                        const result = await retryFailed(op.id);
                        if (result.outcome === "completed") {
                          setBanner({
                            kind: "info",
                            text: "Synced",
                          });
                        } else if (result.outcome === "deleted") {
                          setBanner({
                            kind: "warn",
                            text: "Operation abandoned, local entity removed",
                          });
                        } else {
                          setBanner({
                            kind: "warn",
                            text: "Retry did not succeed, try again later.",
                          });
                        }
                      })}
                    >
                      {isBusy ? "Working\u2026" : "Retry"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isBusy}
                      data-testid={`permanently-failed-dismiss-${op.id}`}
                      onClick={withInflight(op.id, async () => {
                        await dismissFailed(op.id);
                        setBanner({
                          kind: "warn",
                          text: "Operation abandoned, local entity removed",
                        });
                      })}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
