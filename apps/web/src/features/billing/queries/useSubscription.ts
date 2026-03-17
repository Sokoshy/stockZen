"use client";

import { api } from "~/trpc/react";

export function useSubscription() {
  return api.billing.current.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    networkMode: "offlineFirst",
    retry: false,
    refetchOnWindowFocus: false,
  });
}
