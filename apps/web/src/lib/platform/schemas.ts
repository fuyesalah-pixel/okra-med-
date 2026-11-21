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

export const listTenantsQuerySchema = z.object({
  status: z.enum(tenantStatuses).optional(),
  search: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
