"use client";

import { api } from "~/trpc/react";
import { useState } from "react";

function getAlertBadgeStyles(level: "red" | "orange" | "green"): string {
  if (level === "red") {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (level === "orange") {
    return "bg-orange-100 text-orange-800 border-orange-200";
  }
  return "bg-green-100 text-green-800 border-green-200";
}

interface ActiveAlertsListProps {
  onAlertHandled?: () => void;
}

export function ActiveAlertsList({ onAlertHandled }: ActiveAlertsListProps) {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const utils = api.useUtils();

  const { data: alertsData, isLoading, error } = api.alerts.listActive.useQuery({});

  const markHandledMutation = api.alerts.markHandled.useMutation({
    onSuccess: () => {
      void utils.alerts.listActive.invalidate();
      onAlertHandled?.();
    },
    onSettled: () => {
      setActionInProgress(null);
    },
  });

  const snoozeMutation = api.alerts.snooze.useMutation({
    onSuccess: () => {
      void utils.alerts.listActive.invalidate();
      onAlertHandled?.();
    },
    onSettled: () => {
      setActionInProgress(null);
    },
  });

  const handleMarkHandled = (alertId: string) => {
    setActionInProgress(alertId);
    markHandledMutation.mutate({ alertId });
  };

  const handleSnooze = (alertId: string) => {
    setActionInProgress(alertId);
    snoozeMutation.mutate({ alertId });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
        <p className="mt-2 text-sm text-gray-500">Loading alerts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
        <p className="mt-2 text-sm text-red-600">Failed to load alerts</p>
      </div>
    );
  }

  const alerts = alertsData?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
        <p className="mt-2 text-sm text-gray-500">No active alerts. All products are healthy!</p>
      </div>
    );
  }

  const redAlerts = alerts.filter((a) => a.level === "red");
  const orangeAlerts = alerts.filter((a) => a.level === "orange");

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Active Alerts</h3>
        <span className="text-sm text-gray-500">
          {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          {redAlerts.length > 0 && (
            <span className="ml-2 font-medium text-red-600">
              ({redAlerts.length} critical)
            </span>
          )}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium uppercase ${getAlertBadgeStyles(alert.level)}`}
              >
                {alert.level}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{alert.productName}</p>
                <p className="text-xs text-gray-500">Stock: {alert.currentStock}</p>
              </div>
              {alert.snoozedUntil && (
                <span className="text-xs text-gray-400 italic">
                  Snoozed until {new Date(alert.snoozedUntil).toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleMarkHandled(alert.id)}
                disabled={actionInProgress === alert.id}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionInProgress === alert.id && markHandledMutation.isPending
                  ? "Processing..."
                  : "Mark Handled"}
              </button>
              <button
                onClick={() => handleSnooze(alert.id)}
                disabled={actionInProgress === alert.id}
                className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionInProgress === alert.id && snoozeMutation.isPending
                  ? "Processing..."
                  : "Snooze 8h"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
