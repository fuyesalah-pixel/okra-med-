import type { LucideIcon } from "lucide-react";

type Variant = "default" | "warning";
type TrendTone = "neutral" | "positive" | "negative";

interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendTone?: TrendTone;
  icon: LucideIcon;
  variant?: Variant;
  loading?: boolean;
}

export function KpiCard({
  title,
  value,
  trend,
  trendTone = "neutral",
  icon: Icon,
  variant = "default",
  loading,
}: KpiCardProps) {
  if (loading) return <KpiCardSkeleton />;

  const isWarning = variant === "warning";

  const trendColor =
    trendTone === "positive"
      ? "text-[var(--success)]"
      : trendTone === "negative"
        ? "text-[var(--destructive)]"
        : "text-[var(--muted-foreground)]";

  return (
    <div
      className={[
        "rounded-xl border p-5 flex flex-col gap-3",
        isWarning
          ? "border-[var(--warning)] bg-[var(--warning-surface)]"
          : "border-[var(--border)] bg-[var(--card)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">{title}</span>
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-lg",
            isWarning ? "bg-[var(--warning-surface-foreground)]/10" : "bg-[var(--muted)]",
          ].join(" ")}
        >
          <Icon
            size={18}
            className={isWarning ? "text-[var(--warning)]" : "text-[var(--accent)]"}
            aria-hidden
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-2xl font-bold text-[var(--card-foreground)] tabular-nums">{value}</span>
        {trend && <span className={`text-xs ${trendColor}`}>{trend}</span>}
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-[var(--muted)]" />
        <div className="h-9 w-9 rounded-lg bg-[var(--muted)]" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-7 w-16 rounded bg-[var(--muted)]" />
        <div className="h-3 w-32 rounded bg-[var(--muted)]" />
      </div>
    </div>
  );
}
