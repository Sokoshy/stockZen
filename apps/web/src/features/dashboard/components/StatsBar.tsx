"use client";

interface StatsBarProps {
  totalProducts: number;
  activeAlertsCount: number;
  pmi: number | null;
  isLoading?: boolean;
}

function getPMIColor(pmi: number): string {
  if (pmi >= 80) return "text-green-600";
  if (pmi >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function StatsBar({
  totalProducts,
  activeAlertsCount,
  pmi,
  isLoading = false,
}: StatsBarProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg bg-white p-6 shadow"
          >
            <div className="h-4 w-24 rounded bg-gray-200"></div>
            <div className="mt-3 h-8 w-16 rounded bg-gray-200"></div>
          </div>
        ))}
      </div>
    );
  }

  const pmiDisplay =
    pmi !== null ? (totalProducts === 0 ? "N/A" : pmi.toString()) : "N/A";

  const pmiExplanation =
    totalProducts === 0
      ? "Add products to see your Peace of Mind Index"
      : "Red alerts lower PMI by 40%, orange alerts by 15%";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg bg-white p-6 shadow">
        <dt className="text-sm font-medium text-gray-500">Total Products</dt>
        <dd className="mt-1 text-3xl font-semibold text-gray-900">
          {totalProducts}
        </dd>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <dt className="text-sm font-medium text-gray-500">Active Alerts</dt>
        <dd
          className={`mt-1 text-3xl font-semibold ${
            activeAlertsCount > 0 ? "text-red-600" : "text-green-600"
          }`}
        >
          {activeAlertsCount}
        </dd>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <dt className="text-sm font-medium text-gray-500">PMI Indicator</dt>
        <dd
          className={`mt-1 text-3xl font-semibold ${
            pmi !== null && totalProducts > 0
              ? getPMIColor(pmi)
              : "text-gray-900"
          }`}
        >
          {pmiDisplay}
        </dd>
        <p className="mt-2 text-xs text-gray-500">{pmiExplanation}</p>
      </div>
    </div>
  );
}
