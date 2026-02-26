"use client";

import type { AlertWithProduct } from "~/features/dashboard/queries/useAlerts";

function getAlertBadgeStyles(level: "red" | "orange" | "green"): string {
  if (level === "red") {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (level === "orange") {
    return "bg-orange-100 text-orange-800 border-orange-200";
  }
  return "bg-green-100 text-green-800 border-green-200";
}

interface AlertCardProps {
  alert: AlertWithProduct;
  onMarkHandled?: (alertId: string) => void;
  onSnooze?: (alertId: string) => void;
  isProcessing?: boolean;
  showActions?: boolean;
}

export function AlertCard({
  alert,
  onMarkHandled,
  onSnooze,
  isProcessing = false,
  showActions = true,
}: AlertCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium uppercase ${getAlertBadgeStyles(alert.level)}`}
        >
          {alert.level}
        </span>
        <div>
          <p className="text-sm font-medium text-gray-900">{alert.productName}</p>
          <p className="text-xs text-gray-500">Stock: {alert.currentStock}</p>
          <p className="text-xs text-gray-400">
            Updated: {new Date(alert.updatedAt).toLocaleString()}
          </p>
        </div>
        {alert.snoozedUntil && (
          <span className="text-xs text-gray-400 italic">
            Snoozed until {new Date(alert.snoozedUntil).toLocaleString()}
          </span>
        )}
      </div>

      {showActions && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMarkHandled?.(alert.id)}
            disabled={isProcessing}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Mark Handled"}
          </button>
          <button
            onClick={() => onSnooze?.(alert.id)}
            disabled={isProcessing}
            className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Snooze 8h"}
          </button>
        </div>
      )}
    </div>
  );
}
