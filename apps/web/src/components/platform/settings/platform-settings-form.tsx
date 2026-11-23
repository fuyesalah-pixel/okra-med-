"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { z } from "zod";
import { errorMessage, platformRequest } from "../api-client";
import type { PlatformSetting } from "../platform-types";
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  formatDateTime,
} from "../ui";

const CURRENCIES = ["ETB", "USD", "EUR", "SAR"] as const;

const formSchema = z.object({
  baseFee: z.coerce
    .number({ invalid_type_error: "Enter an amount" })
    .min(0)
    .max(1_000_000),
  trialDays: z.coerce.number().int().min(1).max(90),
  defaultCurrency: z.enum(CURRENCIES),
  supportedCurrencies: z.array(z.enum(CURRENCIES)).min(1),
  platformName: z.string().min(2).max(255),
  supportEmail: z.string().email().max(255),
});

type FormValues = z.infer<typeof formSchema>;

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asCurrencyList(value: unknown): FormValues["supportedCurrencies"] {
  if (!Array.isArray(value)) return ["ETB"];
  const allowed = value.filter((item): item is (typeof CURRENCIES)[number] =>
    CURRENCIES.includes(item as (typeof CURRENCIES)[number]),
  );
  return allowed.length ? allowed : ["ETB"];
}

export function PlatformSettingsForm() {
  const t = useTranslations("platform.settings");
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<PlatformSetting[]>({
    queryKey: ["platform", "settings"],
    queryFn: () => platformRequest<PlatformSetting[]>("/api/platform/settings"),
    staleTime: 15_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      baseFee: 500,
      trialDays: 14,
      defaultCurrency: "ETB",
      supportedCurrencies: ["ETB"],
      platformName: "OkraMed",
      supportEmail: "support@okramed.local",
    },
  });
  const { register, handleSubmit, reset, watch, setValue, formState } = form;

  useEffect(() => {
    if (!data) return;
    const byKey = new Map(data.map((row) => [row.key, row]));
    reset({
      baseFee: asNumber(byKey.get("base_fee")?.value, 50000) / 100,
      trialDays: asNumber(byKey.get("trial_days")?.value, 14),
      defaultCurrency: asString(byKey.get("default_currency")?.value, "ETB") as FormValues["defaultCurrency"],
      supportedCurrencies: asCurrencyList(byKey.get("supported_currencies")?.value),
      platformName: asString(byKey.get("platform_name")?.value, "OkraMed"),
      supportEmail: asString(byKey.get("support_email")?.value, "support@okramed.local"),
    });
  }, [data, reset]);

  const supported = watch("supportedCurrencies");
  const lastUpdated = (data ?? []).reduce<PlatformSetting | null>((latest, row) => {
    if (!latest) return row;
    return new Date(row.updatedAt) > new Date(latest.updatedAt) ? row : latest;
  }, null);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      platformRequest("/api/platform/settings", {
        method: "PUT",
        body: JSON.stringify({
          values: {
            base_fee: Math.round(values.baseFee * 100),
            trial_days: values.trialDays,
            default_currency: values.defaultCurrency,
            supported_currencies: values.supportedCurrencies,
            platform_name: values.platformName.trim(),
            support_email: values.supportEmail.trim(),
          },
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
      setConfirming(false);
      setSaved(true);
      setSaveError("");
    },
    onError: (error) => setSaveError(errorMessage(error, t("saveError"))),
  });

  function toggleCurrency(currency: (typeof CURRENCIES)[number]) {
    const next = supported.includes(currency)
      ? supported.filter((item) => item !== currency)
      : [...supported, currency];
    if (next.length === 0) return;
    setValue("supportedCurrencies", next, { shouldValidate: true });
    setSaved(false);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {isError && <ErrorBanner message={t("errorLoad")} onRetry={() => refetch()} />}

      {isLoading && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded bg-[var(--muted)]" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <form
          onSubmit={handleSubmit(() => {
            setSaved(false);
            setConfirming(true);
          })}
          className="flex flex-col gap-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <Field
            label={t("baseFee")}
            htmlFor="base-fee"
            hint={t("baseFeeHint")}
            error={formState.errors.baseFee?.message}
          >
            <div className="flex items-center gap-2">
              <Input
                id="base-fee"
                type="number"
                step="0.01"
                min="0"
                {...register("baseFee")}
                className="w-40"
              />
              <span className="text-sm text-[var(--muted-foreground)]">ETB</span>
            </div>
          </Field>

          <Field
            label={t("trialDays")}
            htmlFor="trial-days"
            hint={t("trialDaysHint")}
            error={formState.errors.trialDays?.message}
          >
            <Input id="trial-days" type="number" min={1} max={90} {...register("trialDays")} className="w-32" />
          </Field>

          <Field label={t("defaultCurrency")} htmlFor="default-currency" error={formState.errors.defaultCurrency?.message}>
            <Select id="default-currency" {...register("defaultCurrency")} className="w-40">
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-[var(--foreground)]">{t("supportedCurrencies")}</legend>
            <p className="text-xs text-[var(--muted-foreground)]">{t("supportedCurrenciesHint")}</p>
            <div className="flex flex-wrap gap-3">
              {CURRENCIES.map((currency) => (
                <label key={currency} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={supported.includes(currency)}
                    onChange={() => toggleCurrency(currency)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {currency}
                </label>
              ))}
            </div>
            {formState.errors.supportedCurrencies && (
              <p role="alert" className="text-xs text-[var(--destructive)]">
                {formState.errors.supportedCurrencies.message}
              </p>
            )}
          </fieldset>

          <Field label={t("platformName")} htmlFor="platform-name" error={formState.errors.platformName?.message}>
            <Input id="platform-name" {...register("platformName")} />
          </Field>

          <Field label={t("supportEmail")} htmlFor="support-email" error={formState.errors.supportEmail?.message}>
            <Input id="support-email" type="email" {...register("supportEmail")} />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("lastUpdated", {
                date: formatDateTime(lastUpdated?.updatedAt),
                actor: lastUpdated?.updatedByName ?? t("seeded"),
              })}
            </p>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-[var(--success)]">{t("saved")}</span>}
              <Button type="submit" variant="primary">
                <Settings size={15} aria-hidden />
                {t("save")}
              </Button>
            </div>
          </div>
        </form>
      )}

      <Modal
        open={confirming}
        onClose={() => !mutation.isPending && setConfirming(false)}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        busy={mutation.isPending}
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={mutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit((values) => mutation.mutate(values))}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t("saving") : t("confirm")}
            </Button>
          </>
        }
      >
        {saveError && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {saveError}
          </p>
        )}
      </Modal>
    </div>
  );
}
