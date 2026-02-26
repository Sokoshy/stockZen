"use client";

import { api } from "~/trpc/react";

interface AlertWithProduct {
  id: string;
  productId: string;
  productName: string;
  level: "red" | "orange" | "green";
  currentStock: number;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AlertsListPage {
  alerts: AlertWithProduct[];
  nextCursor: string | null;
}

export function useAlerts() {
  return api.alerts.listActive.useInfiniteQuery(
    {},
    {
      getNextPageParam: (lastPage: AlertsListPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  );
}

export function useAlertsFlat() {
  const query = useAlerts();
  
  const alerts = query.data?.pages.flatMap((page: AlertsListPage) => page.alerts) ?? [];
  
  return {
    ...query,
    data: alerts,
  };
}

export type { AlertWithProduct, AlertsListPage };
