"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { updateTenantSettings } from "./tenant-api";
import type { TenantDetailData, TenantSettings } from "./tenant-types";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour");

const formSchema = z.object({
  contactEmail: z.string().max(255).refine((v) => !v || z.string().email().safeParse(v).success, {
    message: "Enter a valid email",
  }),
  contactPhone: z.string().max(31),
  country: z.string().length(2, "Use a 2-letter country code"),
  notes: z.string().max(4000),
  logoUrl: z.string().max(500).refine((v) => !v || /^https?:\/\//.test(v), {
    message: "Use an http(s) URL",
  }),
  primaryColor: hex,
  secondaryColor: hex,
  accentColor: hex,
  defaultLocale: z.string().min(2).max(10),
  defaultCalendar: z.enum(["GC", "EC", "HIJRI"]),
  baseCurrency: z.string().length(3),
  terminology: z.array(
    z.object({
      key: z.string().min(1, "Key is required").max(100),
      value: z.string().max(200),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

function toForm(detail: TenantDetailData): FormValues {
  const settings = detail.settings;
  return {
    contactEmail: detail.tenant.contactEmail ?? "",
    contactPhone: detail.tenant.contactPhone ?? "",
    country: detail.tenant.country,
    notes: detail.tenant.notes ?? "",
    logoUrl: settings?.logoUrl ?? "",
    primaryColor: settings?.primaryColor ?? "#0f172a",
    secondaryColor: settings?.secondaryColor ?? "#64748b",
    accentColor: settings?.accentColor ?? "#3b82f6",
    defaultLocale: settings?.defaultLocale ?? "en",
    defaultCalendar: settings?.defaultCalendar ?? "GC",
    baseCurrency: settings?.baseCurrency ?? "ETB",
    terminology: Object.entries(settings?.terminologyOverrides ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
  };
}

export function TenantSettingsTab({ detail }: { detail: TenantDetailData }) {
  const t = useTranslations("platform.tenants.detail.settings");
  const archived = detail.tenant.status === "archived";
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toForm(detail),
  });
  const { control, handleSubmit, register, setValue, watch, reset, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "terminology" });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const terminologyOverrides = Object.fromEntries(
        values.terminology.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
      );
      const payload: Partial<TenantSettings> & {
        contactEmail?: string | null;
        contactPhone?: string | null;
        country?: string;
        notes?: string | null;
      } = {
        contactEmail: values.contactEmail.trim() || null,
        contactPhone: values.contactPhone.trim() || null,
        country: values.country.toUpperCase(),
        notes: values.notes.trim() || null,
        logoUrl: values.logoUrl.trim() || null,
        primaryColor: values.primaryColor,
        secondaryColor: values.secondaryColor,
        accentColor: values.accentColor,
        defaultLocale: values.defaultLocale,
        defaultCalendar: values.defaultCalendar,
        baseCurrency: values.baseCurrency.toUpperCase(),
        terminologyOverrides,
      };
      return updateTenantSettings(detail.tenant.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenant", detail.tenant.id] });
      reset(watch());
    },
  });

  const colorFields = [
    { name: "primaryColor", label: t("primaryColor") },
    { name: "secondaryColor", label: t("secondaryColor") },
    { name: "accentColor", label: t("accentColor") },
  ] as const;

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("title")}</h2>
      </div>

      {archived && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
          {t("archivedHint")}
        </p>
      )}

      <fieldset disabled={archived || mutation.isPending} className="flex flex-col gap-5">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
            {t("contactSection")}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("email")}</span>
              <input
                type="email"
                {...register("contactEmail")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              {formState.errors.contactEmail && (
                <span className="text-xs text-[var(--destructive)]">
                  {formState.errors.contactEmail.message}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("phone")}</span>
              <input
                {...register("contactPhone")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("country")}</span>
              <input
                maxLength={2}
                {...register("country")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              {formState.errors.country && (
                <span className="text-xs text-[var(--destructive)]">
                  {formState.errors.country.message}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">{t("notes")}</span>
              <textarea
                rows={3}
                {...register("notes")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
            {t("brandingSection")}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium">{t("logoUrl")}</span>
              <input
                type="url"
                placeholder="https://…"
                {...register("logoUrl")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <span className="text-xs text-[var(--muted-foreground)]">{t("logoHint")}</span>
              {formState.errors.logoUrl && (
                <span className="text-xs text-[var(--destructive)]">
                  {formState.errors.logoUrl.message}
                </span>
              )}
            </label>

            {colorFields.map((field) => (
              <label key={field.name} className="flex items-center gap-3 text-sm">
                <input
                  type="color"
                  aria-label={field.label}
                  value={watch(field.name)}
                  onChange={(event) => setValue(field.name, event.target.value, { shouldDirty: true })}
                  className="h-9 w-12 cursor-pointer rounded border border-[var(--input)] bg-[var(--background)] p-0.5"
                />
                <span className="flex flex-col">
                  <span className="font-medium">{field.label}</span>
                  <span className="font-mono text-xs text-[var(--muted-foreground)]">
                    {watch(field.name)}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("defaultLocale")}</span>
              <input
                {...register("defaultLocale")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("defaultCalendar")}</span>
              <select
                {...register("defaultCalendar")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="GC">GC</option>
                <option value="EC">EC</option>
                <option value="HIJRI">HIJRI</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("baseCurrency")}</span>
              <input
                maxLength={3}
                {...register("baseCurrency")}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
            {t("terminologySection")}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("terminologyHint")}</p>

          <div className="mt-3 flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-start gap-2">
                <input
                  aria-label={t("termKey")}
                  placeholder={t("termKey")}
                  {...register(`terminology.${index}.key`)}
                  className="min-w-[160px] flex-1 rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <input
                  aria-label={t("termValue")}
                  placeholder={t("termValue")}
                  {...register(`terminology.${index}.value`)}
                  className="min-w-[160px] flex-1 rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={t("remove")}
                  className="rounded-lg border border-[var(--border)] p-2 text-[var(--destructive)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => append({ key: "", value: "" })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Plus size={14} aria-hidden />
            {t("addOverride")}
          </button>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={mutation.isPending || !formState.isDirty}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {mutation.isPending ? t("saving") : t("save")}
          </button>
          {mutation.isSuccess && (
            <span role="status" className="text-sm text-[var(--success)]">
              {t("saved")}
            </span>
          )}
          {mutation.isError && (
            <span role="alert" className="text-sm text-[var(--destructive)]">
              {mutation.error.message || t("saveError")}
            </span>
          )}
        </div>
      </fieldset>
    </form>
  );
}
