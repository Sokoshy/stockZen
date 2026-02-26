"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { AlertCard } from "~/features/dashboard/components/AlertCard";
import { EmptyState } from "~/features/dashboard/components/EmptyState";
import { StatsBar } from "~/features/dashboard/components/StatsBar";
import { useAlerts } from "~/features/dashboard/queries/useAlerts";
import { useDashboardStats } from "~/features/dashboard/queries/useDashboardStats";
import { api } from "~/trpc/react";

export function DashboardPageClient() {
  const { data: statsData, isLoading: statsLoading } = useDashboardStats();
  const {
    data: pages,
    isLoading: alertsLoading,
    error: alertsError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAlerts();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();

  const alerts = pages?.pages.flatMap((page) => page.alerts) ?? [];

  const invalidateDashboardData = () => {
    void Promise.all([
      utils.alerts.listActive.invalidate(),
      utils.dashboard.stats.invalidate(),
    ]);
  };

  const markHandledMutation = api.alerts.markHandled.useMutation({
    onSuccess: invalidateDashboardData,
    onSettled: () => {
      setActionInProgress(null);
    },
  });

  const snoozeMutation = api.alerts.snooze.useMutation({
    onSuccess: invalidateDashboardData,
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

  const isLoading = statsLoading || alertsLoading;
  const hasAlerts = alerts.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your inventory with alerts-first priority
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              View products
            </Link>
            <Link
              href="/inventory"
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Record Movement
            </Link>
            <Link
              href="/team"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Team
            </Link>
          </div>
        </div>

        <StatsBar
          totalProducts={statsData?.totalProducts ?? 0}
          activeAlertsCount={statsData?.activeAlertsCount ?? 0}
          pmi={statsData?.pmi ?? null}
          isLoading={statsLoading}
        />

        <div className="mt-8">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Active Alerts</h2>

          {isLoading && !hasAlerts && (
            <div className="rounded-lg bg-white p-6 shadow">
              <p className="text-sm text-gray-500">Loading alerts...</p>
            </div>
          )}

          {alertsError && (
            <div className="rounded-lg bg-white p-6 shadow">
              <p className="text-sm text-red-600">Failed to load alerts</p>
            </div>
          )}

          {!isLoading && !hasAlerts && <EmptyState />}

          {hasAlerts && (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onMarkHandled={handleMarkHandled}
                  onSnooze={handleSnooze}
                  isProcessing={actionInProgress === alert.id}
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
          )}
        </div>
      </main>
    </div>
  );
}
