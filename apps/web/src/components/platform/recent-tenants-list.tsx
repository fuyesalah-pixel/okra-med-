import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DashboardTenant } from "./dashboard-types";

const STATUS_CLASSES: Record<string, string> = {
  trial: "bg-[var(--info-surface)] text-[var(--info-surface-foreground)]",
  active: "bg-[var(--success-surface)] text-[var(--success-surface-foreground)]",
  suspended: "bg-[var(--warning-surface)] text-[var(--warning-surface-foreground)]",
  archived: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("platform.dashboard");
  const key = `status.${status}`;
  // Unknown statuses fall back to the raw value rather than hiding bad data.
  const label = (STATUS_CLASSES[status] ? t(key) : status) as string;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_CLASSES[status] ?? STATUS_CLASSES.archived
      }`}
    >
      {label}
    </span>
  );
}

export function RecentTenantsList({
  tenants,
  loading,
  error,
  onRetry,
}: {
  tenants: DashboardTenant[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations("platform.dashboard");

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--card-foreground)]">{t("recentTenants")}</h2>
        <Link
          href="/platform/tenants"
          className="text-xs text-[var(--accent)] hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
        >
          {t("viewAll")} →
        </Link>
      </div>

      {loading && <RecentTenantsListSkeleton />}

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
          <p className="text-sm">{t("noTenants")}</p>
          <Link href="/platform/tenants/new" className="text-xs text-[var(--accent)] hover:underline">
            {t("createFirstTenant")}
          </Link>
        </div>
      )}

      {!loading && !error && tenants.length > 0 && (
        <ul role="list" className="divide-y divide-[var(--border)]">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <Link
                href={`/platform/tenants/${tenant.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[var(--muted)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--card-foreground)] truncate">{tenant.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">{tenant.slug}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={tenant.status} />
                  <span className="hidden text-xs text-[var(--muted-foreground)] sm:block">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentTenantsListSkeleton() {
  return (
    <ul role="list" className="divide-y divide-[var(--border)] animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-4 w-32 rounded bg-[var(--muted)]" />
            <div className="h-3 w-20 rounded bg-[var(--muted)]" />
          </div>
          <div className="h-5 w-14 rounded-full bg-[var(--muted)]" />
        </li>
      ))}
    </ul>
  );
}
