"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  step1Schema,
  step2Schema,
  RESERVED_SLUGS,
  type Step1Values,
  type Step2Values,
} from "@/lib/wizard/schemas";
import { slugify, formatMoney, applyDiscount } from "@/lib/format";
import { ModuleSelector, type PricedModule, type ModuleSelection } from "@/components/platform/wizard/module-selector";

// ---------------------------------------------------------------- types

interface ModuleListItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isCore: boolean;
  pricing: { instancePrice: number; currency: string } | null;
}

interface DashboardKpi {
  revenue: { currency: string };
  modules?: unknown;
}

// ---------------------------------------------------------------- helpers

function slugAvailabilityKey(slug: string) {
  return ["slug-check", slug] as const;
}

async function checkSlug(slug: string): Promise<boolean> {
  if (!slug || slug.length < 3 || RESERVED_SLUGS.has(slug)) return false;
  const res = await fetch(`/api/platform/tenants?search=${encodeURIComponent(slug)}&limit=1`);
  if (!res.ok) return true; // optimistic: allow if API fails
  const data = await res.json();
  const items = data?.data?.items ?? [];
  // available = no exact match
  return !items.some((t: { slug: string }) => t.slug === slug);
}

async function fetchModules(): Promise<ModuleListItem[]> {
  const res = await fetch("/api/platform/modules");
  if (!res.ok) throw new Error("Failed to load modules");
  return (await res.json()).data as ModuleListItem[];
}

async function provisionTenant(payload: object): Promise<{ data: { tenant: { id: string } } }> {
  const res = await fetch("/api/platform/tenants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? "Provisioning failed";
    const code = body?.error?.code ?? "UNKNOWN";
    const err = new Error(msg) as Error & { code: string; status: number };
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return body;
}

// ---------------------------------------------------------------- step progress bar

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations("platform.wizard");
  const steps: [1 | 2 | 3, string][] = [
    [1, t("step1.title")],
    [2, t("step2.title")],
    [3, t("step3.title")],
  ];

  return (
    <div className="mb-8" aria-label={t("progress", { step, total: 3 })}>
      <p className="mb-3 text-xs font-medium text-[var(--muted-foreground)]">
        {t("progress", { step, total: 3 })}
      </p>
      <div className="flex items-center gap-2">
        {steps.map(([n, label]) => (
          <div key={n} className="flex flex-1 flex-col gap-1.5">
            <div
              className={[
                "h-1.5 rounded-full transition-all",
                n < step
                  ? "bg-[var(--accent)]"
                  : n === step
                    ? "bg-[var(--accent)] opacity-70"
                    : "bg-[var(--border)]",
              ].join(" ")}
            />
            <span
              className={[
                "text-xs",
                n === step ? "font-semibold text-[var(--accent)]" : "text-[var(--muted-foreground)]",
              ].join(" ")}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 1 — basic info

function Step1({ onNext }: { onNext: (v: Step1Values) => void }) {
  const t = useTranslations("platform.wizard.step1");
  const tErr = useTranslations("platform.wizard");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValidating },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { country: "ET", billingCycle: "monthly" } as unknown as Step1Values,
  });

  const name = watch("name");
  const slug = watch("slug");
  const slugTouched = useRef(false);

  // Auto-generate slug from name until user edits it manually
  useEffect(() => {
    if (!slugTouched.current && name) {
      setValue("slug", slugify(name), { shouldValidate: true });
    }
  }, [name, setValue]);

  // Debounced slug availability check
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const slugTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!slug || slug.length < 3 || RESERVED_SLUGS.has(slug)) {
      setSlugAvailable(null);
      return;
    }
    if (slugTimer.current) clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(async () => {
      const available = await checkSlug(slug);
      setSlugAvailable(available);
    }, 400);
    return () => { if (slugTimer.current) clearTimeout(slugTimer.current); };
  }, [slug]);

  const pw = watch("adminPassword");

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {/* Clinic info */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-[var(--foreground)]">{t("clinicInfo")}</legend>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("name")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <input
            id="name"
            {...register("name")}
            placeholder={t("namePlaceholder")}
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("slug")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="slug"
              {...register("slug", {
                onChange: () => { slugTouched.current = true; },
              })}
              placeholder="my-clinic"
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 pr-8 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            {slug && slug.length >= 3 && !errors.slug && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                {slugAvailable === null ? "…" : slugAvailable ? "✅" : "❌"}
              </span>
            )}
          </div>
          {errors.slug && <p className="mt-1 text-xs text-red-500">{errors.slug.message}</p>}
          {slugAvailable === false && !errors.slug && (
            <p className="mt-1 text-xs text-red-500">{tErr("slugTaken")}</p>
          )}
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("slugHint")}</p>
        </div>

        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("contactEmail")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <input
            id="contactEmail"
            type="email"
            {...register("contactEmail")}
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.contactEmail && <p className="mt-1 text-xs text-red-500">{errors.contactEmail.message}</p>}
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="contactPhone" className="block text-sm font-medium text-[var(--foreground)] mb-1">
              {t("phone")}
            </label>
            <input
              id="contactPhone"
              type="tel"
              {...register("contactPhone")}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div className="w-28">
            <label htmlFor="country" className="block text-sm font-medium text-[var(--foreground)] mb-1">
              {t("country")}
            </label>
            <input
              id="country"
              {...register("country")}
              maxLength={2}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] uppercase outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
        </div>
      </fieldset>

      {/* Admin account */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-[var(--foreground)]">{t("adminAccount")}</legend>

        <div>
          <label htmlFor="adminEmail" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("adminEmail")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <input
            id="adminEmail"
            type="email"
            {...register("adminEmail")}
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.adminEmail && <p className="mt-1 text-xs text-red-500">{errors.adminEmail.message}</p>}
        </div>

        <div>
          <label htmlFor="adminPassword" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("adminPassword")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <input
            id="adminPassword"
            type="password"
            {...register("adminPassword")}
            autoComplete="new-password"
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.adminPassword && <p className="mt-1 text-xs text-red-500">{errors.adminPassword.message}</p>}
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("passwordHint")}</p>
        </div>

        <div>
          <label htmlFor="adminPasswordConfirm" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            {t("confirmPassword")} <span aria-hidden className="text-red-500">*</span>
          </label>
          <input
            id="adminPasswordConfirm"
            type="password"
            {...register("adminPasswordConfirm")}
            autoComplete="new-password"
            className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {errors.adminPasswordConfirm && (
            <p className="mt-1 text-xs text-red-500">{errors.adminPasswordConfirm.message}</p>
          )}
        </div>
      </fieldset>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={slugAvailable === false}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-opacity"
        >
          {t("next")} <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- step 2 — modules

function Step2({
  onNext,
  onBack,
}: {
  onNext: (v: Step2Values) => void;
  onBack: () => void;
}) {
  const t = useTranslations("platform.wizard.step2");
  const tW = useTranslations("platform.wizard");

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["platform-modules"],
    queryFn: fetchModules,
  });

  const { data: dashboard } = useQuery<DashboardKpi>({
    queryKey: ["platform-dashboard"],
    queryFn: () => fetch("/api/platform/dashboard").then((r) => r.json()).then((d) => d.data),
    staleTime: 60_000,
  });

  const currency = dashboard?.revenue?.currency ?? "ETB";
  const baseFee = 0; // from platform_settings; use 0 as default

  const [selections, setSelections] = useState<ModuleSelection[]>([]);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [error, setError] = useState("");

  function handleNext() {
    if (selections.length === 0) {
      setError(t("atLeastOne"));
      return;
    }
    setError("");
    const result = step2Schema.safeParse({ modules: selections, billingCycle });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "Invalid selection");
      return;
    }
    onNext(result.data);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[var(--muted-foreground)]">
        <Loader2 size={18} className="animate-spin" /> {tW("loadingModules")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleSelector
        modules={modules as PricedModule[]}
        selections={selections}
        billingCycle={billingCycle}
        baseFee={baseFee}
        currency={currency}
        onChange={setSelections}
        onCycleChange={setBillingCycle}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden /> {tW("back")}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-opacity"
        >
          {tW("next")} <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 3 — review

function Step3({
  step1,
  step2,
  onBack,
}: {
  step1: Step1Values;
  step2: Step2Values;
  onBack: () => void;
}) {
  const t = useTranslations("platform.wizard.step3");
  const tW = useTranslations("platform.wizard");
  const router = useRouter();

  const { data: modules = [] } = useQuery({
    queryKey: ["platform-modules"],
    queryFn: fetchModules,
  });

  const mutation = useMutation({
    mutationFn: () =>
      provisionTenant({
        name: step1.name,
        slug: step1.slug,
        contactEmail: step1.contactEmail,
        contactPhone: step1.contactPhone,
        country: step1.country,
        adminEmail: step1.adminEmail,
        adminPassword: step1.adminPassword,
        modules: step2.modules,
        billingCycle: step2.billingCycle,
      }),
    onSuccess: (data) => {
      const id = data.data.tenant.id;
      router.push(`/platform/tenants/${id}?provisioned=1`);
    },
  });

  const baseFee = 0;
  const currency = "ETB";
  const rawSubtotal = step2.modules.reduce((sum, sel) => {
    const mod = modules.find((m: ModuleListItem) => m.key === sel.key);
    if (!mod?.pricing) return sum;
    return sum + sel.count * mod.pricing.instancePrice;
  }, baseFee);
  const discounted = applyDiscount(rawSubtotal, step2.billingCycle);
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString();

  const cycleLabel: Record<string, string> = {
    monthly: "Monthly",
    six_months: "Every 6 months (−10%)",
    annual: "Annual (−20%)",
  };

  return (
    <div className="space-y-6">
      {/* Clinic summary */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--card-foreground)]">{t("clinicSummary")}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--muted-foreground)]">{tW("step1.name")}</dt>
          <dd className="font-medium text-[var(--foreground)]">{step1.name}</dd>
          <dt className="text-[var(--muted-foreground)]">{tW("step1.slug")}</dt>
          <dd className="font-mono text-[var(--foreground)]">{step1.slug}</dd>
          <dt className="text-[var(--muted-foreground)]">{tW("step1.contactEmail")}</dt>
          <dd className="text-[var(--foreground)]">{step1.contactEmail}</dd>
          <dt className="text-[var(--muted-foreground)]">{tW("step1.adminEmail")}</dt>
          <dd className="text-[var(--foreground)]">{step1.adminEmail}</dd>
        </dl>
      </div>

      {/* Modules summary */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--card-foreground)]">{t("subscriptionSummary")}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {tW("step2.billingCycle")}: {cycleLabel[step2.billingCycle] ?? step2.billingCycle}
        </p>
        <ul className="space-y-1.5">
          {step2.modules.map((sel) => {
            const mod = modules.find((m: ModuleListItem) => m.key === sel.key);
            return (
              <li key={sel.key} className="flex items-center justify-between text-sm">
                <span className="text-[var(--foreground)]">
                  {mod?.name ?? sel.key} ×{sel.count}
                </span>
                {mod?.pricing && (
                  <span className="tabular-nums text-[var(--muted-foreground)]">
                    {formatMoney(sel.count * mod.pricing.instancePrice, currency)}/mo
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-[var(--border)] pt-3 flex justify-between font-semibold">
          <span className="text-[var(--foreground)]">{t("total")}</span>
          <span className="text-[var(--accent)] tabular-nums">{formatMoney(discounted, currency)}/mo</span>
        </div>
      </div>

      {/* Trial notice */}
      <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3 text-sm text-[var(--foreground)]">
        🎉 {t("trialNotice", { date: trialEnd })}
      </div>

      {/* Error */}
      {mutation.isError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {(mutation.error as Error & { code?: string }).message}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden /> {tW("back")}
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] transition-opacity"
        >
          {mutation.isPending ? (
            <><Loader2 size={16} className="animate-spin" aria-hidden /> {t("creating")}</>
          ) : (
            <><Check size={16} aria-hidden /> {t("createTenant")}</>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- main wizard page

export default function NewTenantPage() {
  const t = useTranslations("platform.wizard");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Values | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t("subtitle")}</p>
      </div>

      <StepBar step={step} />

      {step === 1 && (
        <Step1
          onNext={(v) => {
            setStep1Data(v);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <Step2
          onNext={(v) => {
            setStep2Data(v);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && step1Data && step2Data && (
        <Step3 step1={step1Data} step2={step2Data} onBack={() => setStep(2)} />
      )}
    </div>
  );
}
