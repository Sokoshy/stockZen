import type { CurrentUsageOutput, SubscriptionLimits } from "~/schemas/billing";

interface UsageDisplayProps {
  usage: CurrentUsageOutput;
  limits: SubscriptionLimits;
}

function getUsagePercentage(current: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(Math.round((current / limit) * 100), 100);
}

function getUsageTone(current: number, limit: number) {
  if (current > limit) {
    return {
      barClassName: "bg-red-500",
      textClassName: "text-red-700",
      helperText: "Usage exceeds the current plan limit.",
    };
  }

  if (current === limit) {
    return {
      barClassName: "bg-amber-500",
      textClassName: "text-amber-700",
      helperText: "Usage is currently at the plan limit.",
    };
  }

  return {
    barClassName: "bg-emerald-500",
    textClassName: "text-emerald-700",
    helperText: "Usage is within the current plan limit.",
  };
}

function UsageMeter(props: {
  label: string;
  current: number;
  limit: number;
}) {
  const percentage = getUsagePercentage(props.current, props.limit);
  const tone = getUsageTone(props.current, props.limit);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-700">{props.label}</p>
          <p className={`mt-1 text-sm font-semibold ${tone.textClassName}`}>
            {props.current}/{props.limit}
          </p>
        </div>
        <p className="text-xs text-gray-500">{percentage}% used</p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-all ${tone.barClassName}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-gray-500">{tone.helperText}</p>
    </div>
  );
}

export function UsageDisplay({ usage, limits }: UsageDisplayProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <UsageMeter label="Products" current={usage.productCount} limit={limits.maxProducts} />
      <UsageMeter label="Users" current={usage.userCount} limit={limits.maxUsers} />
    </div>
  );
}
