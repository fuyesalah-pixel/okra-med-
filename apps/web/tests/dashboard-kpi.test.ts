import { describe, expect, it } from "vitest";
import { deriveKpis, formatSignedPercent } from "@/components/platform/dashboard-kpis";
import type { DashboardData } from "@/components/platform/dashboard-types";

/**
 * Fixture shaped exactly like `GET /api/platform/dashboard` -> `{ data }`.
 *
 * The dashboard page must not display any number that is not reachable from
 * this payload. `deriveKpis` is the page's only KPI source, so asserting the
 * mapping here proves the cards read from the API rather than from literals.
 * (Break-it: replace `deriveKpis` with hardcoded returns -> this test goes red.)
 */
const apiResponse: DashboardData = {
  generatedAt: "2026-11-22T10:00:00.000Z",
  tenants: {
    total: 7,
    byStatus: { trial: 3, active: 2, suspended: 1, archived: 1 },
    createdThisMonth: 4,
    trialsExpiringIn7Days: 2,
    trialsEndingToday: 1,
    trialsEndingSoon: [
      { id: "t1", name: "Demo Clinic", slug: "demo-clinic", trialEndsAt: "2026-11-23T00:00:00.000Z" },
      { id: "t2", name: "Second Clinic", slug: "second-clinic", trialEndsAt: "2026-11-27T00:00:00.000Z" },
    ],
    recent: [
      {
        id: "t1",
        name: "Demo Clinic",
        slug: "demo-clinic",
        status: "trial",
        createdAt: "2026-11-20T10:00:00.000Z",
      },
    ],
  },
  subscriptions: { active: 6, trialing: 3, total: 9 },
  revenue: {
    currency: "ETB",
    mrr: 125_000,
    arr: 1_500_000,
    mrrChangePct: 12.5,
    byCurrency: [{ currency: "ETB", amount: 125_000 }],
  },
  recentActivity: [
    {
      id: "a1",
      action: "tenant.create",
      entityType: "tenant",
      entityId: "t1",
      createdAt: "2026-11-21T08:00:00.000Z",
      actor: "Platform Admin",
    },
  ],
  modules: { total: 10, active: 10 },
  users: { total: 5 },
};

describe("dashboard KPI derivation", () => {
  it("takes every card value from the API response", () => {
    const kpis = deriveKpis(apiResponse);

    expect(kpis.totalTenants).toBe(7);
    expect(kpis.newThisMonth).toBe(4);
    expect(kpis.activeSubscriptions).toBe(9);
    expect(kpis.trialingSubscriptions).toBe(3);
    expect(kpis.activeSubscriptionsOnly).toBe(6);
    expect(kpis.mrr).toBe(125_000);
    expect(kpis.currency).toBe("ETB");
    expect(kpis.trialsEnding).toBe(2);
    expect(kpis.trialsEndingToday).toBe(1);
    expect(kpis.trialsEndingThisWeek).toBe(2);
  });

  it("does not invent an MRR trend when the API reports none", () => {
    const kpis = deriveKpis({
      ...apiResponse,
      revenue: { ...apiResponse.revenue, mrrChangePct: null },
    });
    expect(kpis.mrrChangePct).toBeNull();
  });

  it("formats the MRR comparison with an explicit sign", () => {
    expect(formatSignedPercent(12.5)).toBe("+12.5");
    expect(formatSignedPercent(-3)).toBe("-3");
    expect(formatSignedPercent(0)).toBe("0");
  });
});
