export type Pricing = {
  id: string;
  instancePrice: number;
  currency: string;
  updatedAt: string | null;
} | null;

export type ModuleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  descriptionLong: string | null;
  displayOrder: number;
  isCore: boolean;
  isActive: boolean;
  pricing: Pricing;
};

export type PricingHistoryRow = {
  id: string;
  instancePrice: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

export type PlatformSetting = {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedByEmail: string | null;
};

export type PlatformAuditRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
  actor: string;
  actorEmail: string | null;
};

export type PlatformAuditData = {
  items: PlatformAuditRow[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    actions: string[];
    entityTypes: string[];
    actors: { id: string; name: string; email: string }[];
  };
};

export type PlatformUserRow = {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "platform_support";
  isActive: boolean;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type NotificationRecipient = { id: string; name: string; slug: string };

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  audience: string[];
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
  allTenants: boolean;
  recipients: NotificationRecipient[];
  status: "queued" | "sent";
};
