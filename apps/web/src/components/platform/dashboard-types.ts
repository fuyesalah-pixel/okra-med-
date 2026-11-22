export interface DashboardTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

export interface TrialEndingTenant {
  id: string;
  name: string;
  slug: string;
  trialEndsAt: string | null;
}

export interface DashboardActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: string | null;
}

export interface DashboardData {
  generatedAt: string;
  tenants: {
    total: number;
    byStatus: {
      trial: number;
      active: number;
      suspended: number;
      archived: number;
    };
    createdThisMonth: number;
    trialsExpiringIn7Days: number;
    trialsEndingToday: number;
    trialsEndingSoon: TrialEndingTenant[];
    recent: DashboardTenant[];
  };
  subscriptions: {
    active: number;
    trialing: number;
    total: number;
  };
  revenue: {
    currency: string;
    mrr: number;
    arr: number;
    /** Percentage change vs last month, or null when there is no baseline. */
    mrrChangePct: number | null;
    byCurrency: { currency: string; amount: number }[];
  };
  recentActivity: DashboardActivity[];
  modules: { total: number; active: number };
  users: { total: number };
}
