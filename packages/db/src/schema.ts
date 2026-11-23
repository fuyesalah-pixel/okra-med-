import { pgTable, pgEnum, uuid, varchar, text, boolean, timestamp, jsonb, integer, unique, uniqueIndex, index, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const platformUserRoleEnum = pgEnum("platform_user_role", ["super_admin", "platform_support"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["trial", "active", "suspended", "archived"]);
export const calendarEnum = pgEnum("calendar_type", ["GC", "EC", "HIJRI"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled", "expired"]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "six_months", "annual"]);
export const departmentTypeEnum = pgEnum("department_type", ["clinical", "lab", "pharmacy", "admin"]);
export const notificationSeverityEnum = pgEnum("notification_severity", ["info", "warning", "critical"]);

// ---------- Platform tables (no tenant_id) ----------

export const platformUsers = pgTable("platform_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  /** Legacy column: Better Auth stores the credential hash in platform_accounts.password. */
  passwordHash: varchar("password_hash", { length: 255 }).notNull().default(""),
  name: varchar("name", { length: 255 }).notNull(),
  role: platformUserRoleEnum("role").notNull().default("platform_support"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Better Auth storage (platform control plane) ----------
// IDs are `text` because Better Auth generates opaque string ids for these
// models; only platform_users.id is a database-generated uuid.

export const platformSessions = pgTable("platform_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("platform_sessions_user_idx").on(t.userId),
}));

export const platformAccounts = pgTable("platform_accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => platformUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("platform_accounts_user_idx").on(t.userId),
}));

export const platformVerifications = pgTable("platform_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  identifierIdx: index("platform_verifications_identifier_idx").on(t.identifier),
}));

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 63 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 31 }),
  country: varchar("country", { length: 2 }).notNull().default("ET"),
  notes: text("notes"),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  logoUrl: varchar("logo_url", { length: 500 }),
  primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#0f172a"),
  secondaryColor: varchar("secondary_color", { length: 20 }).notNull().default("#64748b"),
  accentColor: varchar("accent_color", { length: 20 }).notNull().default("#3b82f6"),
  defaultLocale: varchar("default_locale", { length: 10 }).notNull().default("en"),
  defaultCalendar: calendarEnum("default_calendar").notNull().default("GC"),
  baseCurrency: varchar("base_currency", { length: 5 }).notNull().default("ETB"),
  terminologyOverrides: jsonb("terminology_overrides").notNull().default({}),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 63 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  descriptionLong: text("description_long"),
  displayOrder: integer("display_order").notNull().default(0),
  isCore: boolean("is_core").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modulePricing = pgTable("module_pricing", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: uuid("module_id").notNull().references(() => modules.id),
  instancePrice: integer("instance_price").notNull(),
  currency: varchar("currency", { length: 5 }).notNull().default("ETB"),
  isActive: boolean("is_active").notNull().default(true),
  /** Admin who set the price. Null for prices seeded before 0009. */
  createdBy: uuid("created_by").references(() => platformUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One active price per module; superseded rows stay for price history.
  activeModuleUnique: uniqueIndex("module_pricing_active_module_uq").on(t.moduleId).where(sql`is_active`),
}));

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
  nextInvoiceAt: timestamp("next_invoice_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Composite FK target for subscription_items. See 0006_phase1_composite_fk.sql.
  idTenantUnique: unique("subscriptions_id_tenant_id_unique").on(t.id, t.tenantId),
  tenantIdx: index("subscriptions_tenant_idx").on(t.tenantId),
}));

export const subscriptionItems = pgTable("subscription_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id").notNull().references(() => modules.id),
  instanceCount: integer("instance_count").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  /** Snapshot of module_pricing.currency at sale time; never read live for billing. */
  currency: text("currency").notNull().default("ETB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("subscription_items_tenant_idx").on(t.tenantId),
  subscriptionIdx: index("subscription_items_subscription_idx").on(t.subscriptionId),
  /**
   * Defense in depth: tenant_id must match the parent subscription's tenant_id,
   * independently of whatever app.tenant_id happens to be set. See 0006.
   */
  subscriptionTenantFk: foreignKey({
    name: "subscription_items_subscription_tenant_fk",
    columns: [t.subscriptionId, t.tenantId],
    foreignColumns: [subscriptions.id, subscriptions.tenantId],
  }).onDelete("cascade"),
}));

export const platformAuditLog = pgTable("platform_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => platformUsers.id),
  action: varchar("action", { length: 127 }).notNull(),
  entityType: varchar("entity_type", { length: 63 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: varchar("ip", { length: 63 }),
  userAgent: text("user_agent"),
  correlationId: varchar("correlation_id", { length: 63 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  /** Last admin to change the value. Null for seeded settings. */
  updatedBy: uuid("updated_by").references(() => platformUsers.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformNotifications = pgTable("platform_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  severity: notificationSeverityEnum("severity").notNull().default("info"),
  audience: uuid("audience").array().notNull().default(sql`'{}'::uuid[]`),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => platformUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Tenant tables (tenant-scoped unless noted) ----------

export const tenantUsers = pgTable("tenant_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  email: varchar("email", { length: 255 }).notNull(),
  /** Legacy column: Better Auth stores the credential hash in tenant_accounts.password. */
  passwordHash: varchar("password_hash", { length: 255 }).notNull().default(""),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 31 }),
  /** Read by Better Auth; unused by the app's own UI today. */
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isActive: boolean("is_active").notNull().default(true),
  twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEmailUnique: uniqueIndex("tenant_users_tenant_email_uq").on(t.tenantId, t.email),
  tenantIdx: index("tenant_users_tenant_idx").on(t.tenantId),
}));

// ---------- Better Auth storage (tenant-facing) ----------
// No tenant_id on purpose: auth resolves the user before a tenant context
// exists. See 0008_tenant_auth.sql and the allowlist in rls-guard.test.ts.

export const tenantSessions = pgTable("tenant_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => tenantUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("tenant_sessions_user_idx").on(t.userId),
}));

export const tenantAccounts = pgTable("tenant_accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => tenantUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("tenant_accounts_user_idx").on(t.userId),
}));

export const tenantVerifications = pgTable("tenant_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  identifierIdx: index("tenant_verifications_identifier_idx").on(t.identifier),
}));

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 127 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantNameUnique: uniqueIndex("roles_tenant_name_uq").on(t.tenantId, t.name),
  tenantIdx: index("roles_tenant_idx").on(t.tenantId),
}));

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 127 }).notNull().unique(),
  module: varchar("module", { length: 63 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
}));

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => tenantUsers.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.roleId] }),
}));

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: uuid("parent_id"),
  type: departmentTypeEnum("type").notNull().default("clinical"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("departments_tenant_idx").on(t.tenantId),
}));

export const userDepartments = pgTable("user_departments", {
  userId: uuid("user_id").notNull().references(() => tenantUsers.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.departmentId] }),
}));

// tenant_audit_log does NOT cascade from tenants. Audit records are evidence and
// must survive tenant archival. Hard-delete of an audited tenant is intentionally
// impossible; use archive. Do not "fix" the missing `onDelete: cascade`.
export const tenantAuditLog = pgTable("tenant_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  /** Tenant user who performed the action (tenant request paths). */
  actorId: uuid("actor_id").references(() => tenantUsers.id),
  /** Platform admin who performed the action (control-plane paths). At most one actor column is set. */
  platformActorId: uuid("platform_actor_id").references(() => platformUsers.id),
  action: varchar("action", { length: 127 }).notNull(),
  entityType: varchar("entity_type", { length: 63 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: varchar("ip", { length: 63 }),
  userAgent: text("user_agent"),
  correlationId: varchar("correlation_id", { length: 63 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("tenant_audit_tenant_idx").on(t.tenantId),
  platformActorIdx: index("tenant_audit_platform_actor_idx").on(t.platformActorId),
}));
