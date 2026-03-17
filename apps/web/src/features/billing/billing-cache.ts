import type { CurrentSubscriptionOutput, CurrentUsageOutput } from "~/schemas/billing";

export interface BillingCacheSnapshot {
  subscription: CurrentSubscriptionOutput;
  usage: CurrentUsageOutput;
}

function getBillingCacheKey(tenantId: string) {
  return `stockzen:billing:${tenantId}`;
}

export function readBillingCache(tenantId: string): BillingCacheSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(getBillingCacheKey(tenantId));
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as BillingCacheSnapshot;
  } catch {
    return null;
  }
}

export function writeBillingCache(tenantId: string, snapshot: BillingCacheSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getBillingCacheKey(tenantId), JSON.stringify(snapshot));
}
