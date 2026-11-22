"use client";

import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { formatMoney, applyDiscount } from "@/lib/format";

export interface PricedModule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isCore: boolean;
  pricing: { instancePrice: number; currency: string } | null;
}

export interface ModuleSelection {
  key: string;
  count: number;
}

interface Props {
  modules: PricedModule[];
  selections: ModuleSelection[];
  billingCycle: string;
  baseFee: number;
  currency: string;
  onChange: (selections: ModuleSelection[]) => void;
  onCycleChange: (cycle: string) => void;
}

const CYCLE_OPTIONS = [
  { value: "monthly",    label: "Monthly",          discount: 0 },
  { value: "six_months", label: "6 months (−10%)",  discount: 0.1 },
  { value: "annual",     label: "Annual (−20%)",    discount: 0.2 },
];

export function ModuleSelector({
  modules,
  selections,
  billingCycle,
  baseFee,
  currency,
  onChange,
  onCycleChange,
}: Props) {
  const t = useTranslations("platform.wizard");

  const selectionMap = new Map(selections.map((s) => [s.key, s.count]));

  function toggle(mod: PricedModule) {
    if (!mod.pricing) return;
    if (selectionMap.has(mod.key)) {
      onChange(selections.filter((s) => s.key !== mod.key));
    } else {
      onChange([...selections, { key: mod.key, count: 1 }]);
    }
  }

  function setCount(key: string, count: number) {
    onChange(selections.map((s) => (s.key === key ? { ...s, count } : s)));
  }

  const rawSubtotal = selections.reduce((sum, sel) => {
    const mod = modules.find((m) => m.key === sel.key);
    if (!mod?.pricing) return sum;
    return sum + sel.count * mod.pricing.instancePrice;
  }, baseFee);

  const discounted = applyDiscount(rawSubtotal, billingCycle);
  const discountAmount = rawSubtotal - discounted;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Module list */}
      <div className="flex-1">
        <p className="mb-3 text-sm font-medium text-[var(--foreground)]">{t("step2.selectModules")}</p>
        <div className="space-y-2">
          {modules.map((mod) => {
            const selected = selectionMap.has(mod.key);
            const count = selectionMap.get(mod.key) ?? 1;
            return (
              <div
                key={mod.key}
                className={[
                  "rounded-lg border p-4 transition-colors",
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-[var(--border)] bg-[var(--card)]",
                  !mod.pricing ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`mod-${mod.key}`}
                    checked={selected}
                    disabled={!mod.pricing}
                    onChange={() => toggle(mod)}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  <label htmlFor={`mod-${mod.key}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">{mod.name}</span>
                      <span className="text-sm font-semibold text-[var(--accent)] tabular-nums">
                        {mod.pricing
                          ? `${formatMoney(mod.pricing.instancePrice, currency)}/instance`
                          : t("step2.noPricing")}
                      </span>
                    </div>
                    {mod.description && (
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{mod.description}</p>
                    )}
                  </label>
                </div>

                {selected && mod.pricing && (
                  <div className="mt-3 flex items-center gap-2 pl-7">
                    <span className="text-xs text-[var(--muted-foreground)]">{t("step2.instances")}</span>
                    <button
                      type="button"
                      onClick={() => count > 1 && setCount(mod.key, count - 1)}
                      disabled={count <= 1}
                      aria-label="Decrease"
                      className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center text-sm font-medium tabular-nums">{count}</span>
                    <button
                      type="button"
                      onClick={() => count < 20 && setCount(mod.key, count + 1)}
                      disabled={count >= 20}
                      aria-label="Increase"
                      className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky price panel */}
      <div className="lg:w-72">
        <div className="sticky top-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--card-foreground)]">{t("step2.priceSummary")}</h3>

          {/* Billing cycle */}
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)]">{t("step2.billingCycle")}</label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {CYCLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onCycleChange(opt.value)}
                  className={[
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    billingCycle === opt.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-medium"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                  ].join(" ")}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-1.5 text-xs">
            {baseFee > 0 && (
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>{t("step2.baseFee")}</span>
                <span className="tabular-nums">{formatMoney(baseFee, currency)}/mo</span>
              </div>
            )}
            {selections.map((sel) => {
              const mod = modules.find((m) => m.key === sel.key);
              if (!mod?.pricing) return null;
              return (
                <div key={sel.key} className="flex justify-between text-[var(--muted-foreground)]">
                  <span className="truncate">{mod.name} ×{sel.count}</span>
                  <span className="ml-2 flex-shrink-0 tabular-nums">
                    {formatMoney(sel.count * mod.pricing.instancePrice, currency)}/mo
                  </span>
                </div>
              );
            })}
            {selections.length === 0 && baseFee === 0 && (
              <p className="text-[var(--muted-foreground)] italic">{t("step2.noModulesSelected")}</p>
            )}
          </div>

          <div className="border-t border-[var(--border)] pt-3 space-y-1">
            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-green-600 dark:text-green-400">
                <span>{t("step2.discount")}</span>
                <span className="tabular-nums">−{formatMoney(discountAmount, currency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--card-foreground)]">{t("step2.total")}</span>
              <span className="text-lg font-bold text-[var(--accent)] tabular-nums">
                {formatMoney(discounted, currency)}<span className="text-xs font-normal text-[var(--muted-foreground)]">/mo</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
