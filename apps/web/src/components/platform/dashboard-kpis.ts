import type { DashboardData } from "./dashboard-types";

/**
 * The single source of KPI values for the dashboard page.
 *
 * Kept pure and separate from the component so a test can assert that every
 * rendered KPI comes from the `/api/platform/dashboard` payload. If the page is
 * ever tempted to hardcode a number, it stops matching this mapping.
 */
export function deriveKpis(data: DashboardData) {
  return {
    totalTenants: data.tenants.total,
    newThisMonth: data.tenants.createdThisMonth,
    activeSubscriptions: data.subscriptions.total,
    trialingSubscriptions: data.subscriptions.trialing,
    activeSubscriptionsOnly: data.subscriptions.active,
    mrr: data.revenue.mrr,
    currency: data.revenue.currency,
    mrrChangePct: data.revenue.mrrChangePct,
    trialsEnding: data.tenants.trialsExpiringIn7Days,
    trialsEndingToday: data.tenants.trialsEndingToday,
    trialsEndingThisWeek: data.tenants.trialsExpiringIn7Days,
  };
}

export type DerivedKpis = ReturnType<typeof deriveKpis>;

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** `+12` / `-3` / `0` — the sign is part of the copy, not the number. */
export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(rounded)}`;
}
