import { z } from "zod";
import { billingCycles, moduleSelectionSchema } from "@/lib/platform/schemas";

export const RESERVED_SLUGS = new Set([
  "platform", "api", "www", "app", "admin", "login", "signup", "register",
  "dashboard", "help", "support", "mail", "smtp", "okramed", "okra",
  "mekatanker", "demo", "test",
]);

export const wizardSlug = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9-]+$/, "Only lowercase letters, digits and hyphens")
  .refine((v) => !RESERVED_SLUGS.has(v), "This slug is reserved");

export const step1Schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    slug: wizardSlug,
    contactEmail: z.string().email("Enter a valid email").max(255),
    contactPhone: z.string().max(31).optional(),
    country: z.string().length(2).toUpperCase().default("ET"),
    adminEmail: z.string().email("Enter a valid email").max(255),
    adminPassword: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[a-zA-Z]/, "Must contain a letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^a-zA-Z0-9]/, "Must contain a symbol"),
    adminPasswordConfirm: z.string(),
  })
  .refine((v) => v.adminPassword === v.adminPasswordConfirm, {
    message: "Passwords do not match",
    path: ["adminPasswordConfirm"],
  });

export const step2Schema = z.object({
  modules: z
    .array(moduleSelectionSchema)
    .min(1, "Select at least one module"),
  billingCycle: z.enum(billingCycles),
});

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;

export type WizardState = {
  step1: Step1Values | null;
  step2: Step2Values | null;
};
