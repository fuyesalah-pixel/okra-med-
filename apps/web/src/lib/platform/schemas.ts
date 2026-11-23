import { z } from "zod";

const slug = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and hyphens only");

const currency = z.string().length(3).toUpperCase();

export const tenantStatuses = ["trial", "active", "suspended", "archived"] as const;

export const createTenantSchema = z.object({
  slug,
  name: z.string().min(2).max(255),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().max(31).optional(),
  country: z.string().length(2).toUpperCase().default("ET"),
  notes: z.string().max(4000).optional(),
  /** Length of the starting trial; 0 creates the tenant already `active`. */
  trialDays: z.number().int().min(0).max(365).default(14),
});

export const updateTenantSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    contactEmail: z.string().email().max(255).nullable().optional(),
    contactPhone: z.string().max(31).nullable().optional(),
    country: z.string().length(2).toUpperCase().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const suspendTenantSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const archiveTenantSchema = z.object({
  reason: z.string().min(3).max(1000).optional(),
});

export const createModuleSchema = z.object({
  key: slug,
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  descriptionLong: z.string().max(8000).optional(),
  displayOrder: z.number().int().min(0).max(999).default(0),
  isCore: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateModuleSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    descriptionLong: z.string().max(8000).nullable().optional(),
    displayOrder: z.number().int().min(0).max(999).optional(),
    isCore: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

/** Prices are integers in the currency's minor unit (ETB santim, USD cents). */
export const pricingSchema = z.object({
  instancePrice: z.number().int().min(0).max(100_000_000),
  currency: currency.default("ETB"),
});

export const updateSettingSchema = z.object({
  value: z.unknown(),
  description: z.string().max(2000).nullable().optional(),
});

export const billingCycles = ["monthly", "six_months", "annual"] as const;

export const moduleSelectionSchema = z.object({
  key: slug,
  count: z.number().int().min(1).max(1000).default(1),
});

/**
 * Provisioning is the full create: tenant + subscription + admin user.
 * `trialDays` is intentionally not accepted here — the trial length lives in
 * `platform_settings.trial_days` so every tenant is provisioned consistently.
 */
export const provisionTenantSchema = createTenantSchema.omit({ trialDays: true }).extend({
  adminEmail: z.string().email().max(255),
  adminPassword: z.string().min(8).max(200),
  modules: z.array(moduleSelectionSchema).min(1).max(50),
  billingCycle: z.enum(billingCycles).default("monthly"),
});

/** Public price calculator input. No auth, so it is deliberately narrow. */
export const quoteSchema = z.object({
  moduleSelections: z.array(moduleSelectionSchema).min(1).max(50),
});

export const subscriptionPatchSchema = z.object({
  action: z.enum(["renew", "cancel"]),
});

export const impersonateSchema = z.object({
  userId: z.string().uuid(),
});

export const tenantSorts = ["created_desc", "created_asc", "name_asc", "name_desc"] as const;

export const listTenantsQuerySchema = z.object({
  status: z.enum(tenantStatuses).optional(),
  search: z.string().max(255).optional(),
  sort: z.enum(tenantSorts).default("created_desc"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use a 6-digit hex colour");

export const tenantCalendars = ["GC", "EC", "HIJRI"] as const;

/**
 * Tenant settings are split across `tenants` (contact) and `tenant_settings`
 * (branding/terminology). One endpoint accepts both so a single Save does not
 * leave the two rows half-updated from the operator's point of view.
 */
export const updateTenantSettingsSchema = z
  .object({
    contactEmail: z.string().email().max(255).nullable().optional(),
    contactPhone: z.string().max(31).nullable().optional(),
    country: z.string().length(2).toUpperCase().optional(),
    notes: z.string().max(4000).nullable().optional(),
    logoUrl: z.string().url().max(500).nullable().optional(),
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.optional(),
    accentColor: hexColor.optional(),
    defaultLocale: z.string().min(2).max(10).optional(),
    defaultCalendar: z.enum(tenantCalendars).optional(),
    baseCurrency: currency.optional(),
    terminologyOverrides: z
      .record(z.string().min(1).max(100), z.string().max(200))
      .refine((v) => Object.keys(v).length <= 50, { message: "at most 50 overrides" })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const updateSubscriptionModulesSchema = z.object({
  modules: z.array(moduleSelectionSchema).min(1).max(50),
});

export const tenantAuditQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.string().max(127).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  format: z.enum(["json", "csv"]).default("json"),
});

/** Platform-wide audit viewer (Prompt 4.4). Filters match the dropdowns on the page. */
export const platformAuditQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().max(127).optional(),
  entityType: z.string().max(63).optional(),
  requestId: z.string().max(63).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  format: z.enum(["json", "csv"]).default("json"),
});

export const platformRoles = ["super_admin", "platform_support"] as const;

export const createPlatformUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(255),
  role: z.enum(platformRoles).default("platform_support"),
});

export const updatePlatformUserSchema = z
  .object({
    role: z.enum(platformRoles).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const notificationSeverities = ["info", "warning", "critical"] as const;

/**
 * An empty `audience` means every tenant (including ones created later). A
 * non-empty list is an explicit allowlist of tenant ids.
 */
export const createNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  severity: z.enum(notificationSeverities).default("info"),
  audience: z.array(z.string().uuid()).max(100).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * One Save button updates several keys. Sending them together keeps the form
 * from half-applying when one key is rejected, and keeps one audit row per key
 * in the same transaction.
 */
export const updatePlatformSettingsSchema = z.object({
  values: z.record(z.string().min(1).max(100), z.unknown()),
});
