"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { TenantRole } from "~/schemas/team-membership";
import { readBillingCache, writeBillingCache } from "~/features/billing/billing-cache";
import { useSubscription } from "~/features/billing/queries/useSubscription";
import { useUsage } from "~/features/billing/queries/useUsage";
import { UsageDisplay } from "~/features/billing/components/usage-display";

interface BillingOverviewProps {
  actorRole: TenantRole;
  tenantId: string;
}

function useOnlineState() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export function BillingOverview({ actorRole, tenantId }: BillingOverviewProps) {
  const isOnline = useOnlineState();
  const [cachedSnapshot, setCachedSnapshot] = useState<ReturnType<typeof readBillingCache>>(null);
  const [hasLoadedCache, setHasLoadedCache] = useState(false);
  const subscriptionQuery = useSubscription();
  const usageQuery = useUsage();

  const subscription = subscriptionQuery.data ?? cachedSnapshot?.subscription;
  const usage = usageQuery.data ?? cachedSnapshot?.usage;
  const isAdmin = actorRole === "Admin";
  const isLoading = (!subscription || !usage) && !hasLoadedCache;
  const error = subscriptionQuery.error ?? usageQuery.error;

  useEffect(() => {
    setCachedSnapshot(readBillingCache(tenantId));
    setHasLoadedCache(true);
  }, [tenantId]);

  useEffect(() => {
    if (!subscriptionQuery.data || !usageQuery.data) {
      return;
    }

    const nextSnapshot = {
      subscription: subscriptionQuery.data,
      usage: usageQuery.data,
    };

    writeBillingCache(tenantId, nextSnapshot);
    setCachedSnapshot(nextSnapshot);
  }, [subscriptionQuery.data, tenantId, usageQuery.data]);

  if (isLoading && !error) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Billing & Subscription</h1>
        <p className="mt-2 text-sm text-gray-600">Loading your current subscription details...</p>
      </section>
    );
  }

  if ((error && !cachedSnapshot) || !subscription || !usage) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Billing & Subscription</h1>
        <p className="mt-2 text-sm text-red-700">
          We could not load your subscription data. Please try again when your connection is restored.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Billing & Subscription</h1>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Current plan</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{subscription.plan}</p>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Review your current plan limits and tenant usage before deciding whether you need an upgrade.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {isAdmin ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-60"
              >
                Change plan (coming soon)
              </button>
            ) : null}

            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        {!isOnline ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You are offline. Showing the most recently cached subscription data in read-only mode.
          </div>
        ) : null}

        {isOnline && error && cachedSnapshot ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Live billing data could not be refreshed. Showing the most recently cached subscription snapshot.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-gray-700">Product limit</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{subscription.limits.maxProducts}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-gray-700">User limit</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{subscription.limits.maxUsers}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Usage vs limits</h2>
            <p className="mt-1 text-sm text-gray-600">
              Monitor how close your tenant is to the active subscription capacity.
            </p>
          </div>
          <p className="text-sm text-gray-500">Role: {actorRole}</p>
        </div>

        <div className="mt-5">
          <UsageDisplay usage={usage} limits={subscription.limits} />
        </div>
      </section>
    </div>
  );
}
