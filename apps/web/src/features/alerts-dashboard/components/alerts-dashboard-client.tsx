"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { AlertCard } from "~/features/dashboard/components/AlertCard";
import { useAlertsDashboard } from "~/features/alerts-dashboard/queries/use-alerts-dashboard";
import { api } from "~/trpc/react";

export function AlertsDashboardClient() {
  const {
    data: pages,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAlertsDashboard();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();

  const alerts = pages?.pages.flatMap((page) => page.alerts) ?? [];

  const invalidateAlertsData = () => {
    void Promise.all([
      utils.alerts.dashboard.invalidate(),
      utils.alerts.listActive.invalidate(),
      utils.dashboard.stats.invalidate(),
    ]);
  };

  const markHandledMutation = api.alerts.markHandled.useMutation({
    onSuccess: invalidateAlertsData,
    onSettled: () => {
      setActionInProgress(null);
    },
  });

  const snoozeMutation = api.alerts.snooze.useMutation({
    onSuccess: invalidateAlertsData,
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasAlerts = alerts.length > 0;
  const redAlerts = alerts.filter((a) => a.level === "red");
  const orangeAlerts = alerts.filter((a) => a.level === "orange");

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Alerts Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all active stock alerts sorted by priority
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500"
            >
              Back to Dashboard
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              View Products
            </Link>
            <Link
              href="/inventory"
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Record Movement
            </Link>
          </div>
        </div>

        {isLoading && !hasAlerts && (
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">Loading alerts...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-red-600">Failed to load alerts</p>
          </div>
        )}

        {!isLoading && !error && !hasAlerts && (
          <div className="rounded-lg bg-white p-8 shadow">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                All Clear!
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                No active alerts. All your products are healthy!
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link
                  href="/products"
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  View Products
                </Link>
                <Link
                  href="/inventory"
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Record Movement
                </Link>
              </div>
            </div>
          </div>
        )}

        {hasAlerts && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Active Alerts ({alerts.length})
              </h2>
              <div className="flex gap-4 text-sm">
                {redAlerts.length > 0 && (
                  <span className="font-medium text-red-600">
                    {redAlerts.length} critical
                  </span>
                )}
                {orangeAlerts.length > 0 && (
                  <span className="font-medium text-orange-600">
                    {orangeAlerts.length} attention
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onMarkHandled={handleMarkHandled}
                  onSnooze={handleSnooze}
                  isProcessing={actionInProgress === alert.id}
                  showActions={true}
                />
              ))}

              <div ref={loadMoreRef} className="flex justify-center py-4">
                {isFetchingNextPage && (
                  <p className="text-sm text-gray-500">Loading more alerts...</p>
                )}
                {!hasNextPage && alerts.length > 0 && (
                  <p className="text-sm text-gray-400">No more alerts</p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
