"use client";

import { api, type RouterOutputs } from "~/trpc/react";

type AlertsDashboardPage = RouterOutputs["alerts"]["dashboard"];

export function useAlertsDashboard() {
  return api.alerts.dashboard.useInfiniteQuery(
    {},
    {
      getNextPageParam: (lastPage: AlertsDashboardPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  );
}
