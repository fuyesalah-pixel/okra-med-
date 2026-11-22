import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DashboardActivity } from "./dashboard-types";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RecentActivity({
  items,
  loading,
  error,
  onRetry,
}: {
  items: DashboardActivity[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("platform.dashboard");

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--card-foreground)]">{t("recentActivity")}</h2>
        <Link
          href="/platform/audit"
          className="text-xs text-[var(--accent)] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
        >
          {t("viewFullAuditLog")} →
        </Link>
      </div>

      {loading && <RecentActivitySkeleton />}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-10 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("errorLoading")}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-[var(--accent)] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
            >
              {t("retry")}
            </button>
          )}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("noActivity")}</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul role="list" className="divide-y divide-[var(--border)]">
          {items.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--card-foreground)]">
                  <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs">{entry.action}</code>
                  <span className="ml-2 text-[var(--muted-foreground)]">
                    {entry.entityType}
                    {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {entry.actor ?? t("actorSystem")}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                {formatTimestamp(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentActivitySkeleton() {
  return (
    <ul role="list" className="divide-y divide-[var(--border)] animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-4 w-48 rounded bg-[var(--muted)]" />
            <div className="h-3 w-24 rounded bg-[var(--muted)]" />
          </div>
          <div className="h-3 w-24 rounded bg-[var(--muted)]" />
        </li>
      ))}
    </ul>
  );
}
