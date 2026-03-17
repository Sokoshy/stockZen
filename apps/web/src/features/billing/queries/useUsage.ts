"use client";

import { api } from "~/trpc/react";

export function useUsage() {
  return api.billing.usage.useQuery(undefined, {
    staleTime: 60 * 1000,
    networkMode: "offlineFirst",
    retry: false,
    refetchOnWindowFocus: false,
  });
}
