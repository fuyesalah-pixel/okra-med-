import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TrialEndingTenant } from "./dashboard-types";

/** Calendar days between today and the trial end, so an end date two sleeps
 * away reads "2d" regardless of the time of day the page is opened. */
function daysUntil(dateStr: string | null): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function TrialsEndingList({
  tenants,
  loading,
  error,
  onRetry,
}: {
  tenants: TrialEndingTenant[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("platform.dashboard");

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--card-foreground)]">{t("trialsEndingSoon")}</h2>
        <Link
          href={{ pathname: "/platform/tenants", query: { status: "trial" } }}
          className="text-xs text-[var(--accent)] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
        >
          {t("viewAll")} →
        </Link>
      </div>

      {loading && <TrialsListSkeleton />}

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

      {!loading && !error && tenants.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("noTrialsEnding")}</p>
        </div>
      )}

      {!loading && !error && tenants.length > 0 && (
        <ul role="list" className="divide-y divide-[var(--border)]">
          {tenants.map((tenant) => {
            const days = daysUntil(tenant.trialEndsAt);
            const urgent = days <= 2;
            return (
              <li key={tenant.id}>
                <Link
                  href={`/platform/tenants/${tenant.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[var(--muted)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--card-foreground)] truncate">{tenant.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">{tenant.slug}</p>
                  </div>
                  <span
                    className={[
                      "flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                      urgent
                        ? "bg-[var(--destructive-surface)] text-[var(--destructive-surface-foreground)]"
                        : "bg-[var(--warning-surface)] text-[var(--warning-surface-foreground)]",
                    ].join(" ")}
                    aria-label={t("daysRemaining", { days: Number.isFinite(days) ? days : 0 })}
                  >
                    {days <= 0 ? t("endsToday") : t("daysShort", { days })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TrialsListSkeleton() {
  return (
    <ul role="list" className="divide-y divide-[var(--border)] animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-4 w-28 rounded bg-[var(--muted)]" />
            <div className="h-3 w-16 rounded bg-[var(--muted)]" />
          </div>
          <div className="h-5 w-10 rounded-full bg-[var(--muted)]" />
        </li>
      ))}
    </ul>
  );
}
