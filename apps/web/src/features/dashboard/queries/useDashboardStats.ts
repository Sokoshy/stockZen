"use client";

import { api } from "~/trpc/react";

interface DashboardStats {
  totalProducts: number;
  activeAlertsCount: number;
  pmi: number | null;
}

export function useDashboardStats() {
  return api.dashboard.stats.useQuery(undefined, {
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
}

export type { DashboardStats };
