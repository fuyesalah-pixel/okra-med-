export type TenantStatus = "trial" | "active" | "suspended" | "archived";

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  contactEmail: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  suspendedReason: string | null;
  provisionedAt: string | null;
  createdAt: string;
  moduleCount: number;
}

export interface TenantListData {
  items: TenantListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string;
  notes: string | null;
  provisionedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  tenantId: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultLocale: string;
  defaultCalendar: "GC" | "EC" | "HIJRI";
  baseCurrency: string;
  terminologyOverrides: Record<string, string>;
}

export interface Subscription {
  id: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  billingCycle: "monthly" | "six_months" | "annual";
  startsAt: string;
  endsAt: string;
  trialEndsAt: string | null;
  nextInvoiceAt: string | null;
  gracePeriodEndsAt: string | null;
  createdAt: string;
}

export interface SubscriptionItem {
  id: string;
  moduleId: string;
  moduleKey: string;
  moduleName: string;
  instanceCount: number;
  unitPrice: number;
}

export interface Bill {
  base_fee: number;
  currency: string;
  lines: { module: string; instance_count: number; unit_price: number; subtotal: number }[];
  total: number;
}

export interface TenantUserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
}

export interface TenantDetailData {
  tenant: Tenant;
  settings: TenantSettings | null;
  subscription: Subscription | null;
  subscriptionItems: SubscriptionItem[];
  bill: Bill | null;
  users: { total: number; active: number; members: TenantUserRow[] };
}

export interface ModuleCatalogItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isCore: boolean;
  isActive: boolean;
  pricing: { id: string; instancePrice: number; currency: string } | null;
}

export interface TenantAuditRow {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  actor: string;
  actorEmail: string | null;
}

export interface TenantAuditData {
  items: TenantAuditRow[];
  total: number;
  limit: number;
  offset: number;
}
