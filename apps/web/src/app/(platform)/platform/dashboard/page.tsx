"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Building2, Clock, CreditCard, RefreshCw, TrendingUp, type LucideIcon } from "lucide-react";
import { fetchDashboard } from "@/components/platform/dashboard-client";
import { deriveKpis, formatNumber, formatSignedPercent } from "@/components/platform/dashboard-kpis";
import { DashboardSkeleton } from "@/components/platform/dashboard-skeleton";
import { KpiCard } from "@/components/platform/kpi-card";
import { RecentActivity } from "@/components/platform/recent-activity";
import { RecentTenantsList } from "@/components/platform/recent-tenants-list";
import { TrialsEndingList } from "@/components/platform/trials-ending-list";

export default function PlatformDashboardPage() {
  const t = useTranslations("platform.dashboard");

  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["platform", "dashboard"],
    queryFn: fetchDashboard,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Relative "last updated" copy has to age on screen even when no refetch is
  // in flight; a 30s tick matches the query's stale time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastUpdated = (() => {
    if (!dataUpdatedAt) return "";
    const seconds = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    if (seconds < 5) return t("lastUpdatedJustNow");
    if (seconds < 60) return t("lastUpdatedSeconds", { count: seconds });
    return t("lastUpdatedMinutes", { count: Math.floor(seconds / 60) });
  })();

  const kpis = data ? deriveKpis(data) : null;

  const cards: { title: string; value: string | number; trend?: string; trendTone?: "neutral" | "positive" | "negative"; icon: LucideIcon; variant?: "default" | "warning" }[] =
    kpis
      ? [
          {
            title: t("kpi.totalTenants"),
            value: formatNumber(kpis.totalTenants),
            trend: t("kpi.newThisMonth", { count: kpis.newThisMonth }),
            trendTone: kpis.newThisMonth > 0 ? "positive" : "neutral",
            icon: Building2,
          },
          {
            title: t("kpi.activeSubscriptions"),
            value: formatNumber(kpis.activeSubscriptions),
            trend: t("kpi.subscriptionBreakdown", {
              trialing: kpis.trialingSubscriptions,
              active: kpis.activeSubscriptionsOnly,
            }),
            icon: CreditCard,
          },
          {
            title: t("kpi.mrr"),
            value: `${formatNumber(kpis.mrr)} ${kpis.currency}`,
            trend:
              kpis.mrrChangePct === null
                ? undefined
                : t("kpi.mrrChange", { value: formatSignedPercent(kpis.mrrChangePct) }),
            trendTone:
              kpis.mrrChangePct === null
                ? "neutral"
                : kpis.mrrChangePct > 0
                  ? "positive"
                  : kpis.mrrChangePct < 0
                    ? "negative"
                    : "neutral",
            icon: TrendingUp,
          },
          {
            title: t("kpi.trialsEnding"),
            value: formatNumber(kpis.trialsEnding),
            trend: t("kpi.trialsBreakdown", {
              today: kpis.trialsEndingToday,
              week: kpis.trialsEndingThisWeek,
            }),
            icon: Clock,
            variant: "warning",
          },
        ]
      : [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{t("title")}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {data && <span className="text-xs text-[var(--muted-foreground)]">{lastUpdated}</span>}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--card-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} aria-hidden />
            {t("refresh")}
          </button>
        </div>
      </div>

      {isLoading && <DashboardSkeleton />}

      {isError && !isLoading && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-surface)] p-4 text-[var(--destructive-surface-foreground)]"
        >
          <p className="text-sm">{t("errorDashboard")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-current px-3 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <KpiCard
                key={card.title}
                title={card.title}
                value={card.value}
                trend={card.trend}
                trendTone={card.trendTone}
                icon={card.icon}
                variant={card.variant}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RecentTenantsList tenants={data.tenants.recent} error={isError} onRetry={() => refetch()} />
            <TrialsEndingList
              tenants={data.tenants.trialsEndingSoon}
              error={isError}
              onRetry={() => refetch()}
            />
          </div>

          <RecentActivity items={data.recentActivity} error={isError} onRetry={() => refetch()} />
        </>
      )}
    </div>
  );
}
