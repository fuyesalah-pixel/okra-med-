"use client";

import { useState } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { Loader2 } from "lucide-react";
import { ModuleSelector, type PricedModule, type ModuleSelection } from "@/components/platform/wizard/module-selector";
import { formatMoney, applyDiscount } from "@/lib/format";
import en from "@/messages/en.json";

interface QuoteResult {
  base_fee: number;
  currency: string;
  total: number;
  lines: { module: string; instance_count: number; unit_price: number; subtotal: number }[];
}

async function fetchPublicModules(): Promise<PricedModule[]> {
  // Quote page uses the modules endpoint; it's protected but publicly accessible
  // for read-only pricing display. If unavailable, show empty.
  try {
    const res = await fetch("/api/platform/modules");
    if (!res.ok) return [];
    return (await res.json()).data as PricedModule[];
  } catch {
    return [];
  }
}

async function computeQuote(selections: ModuleSelection[]): Promise<QuoteResult | null> {
  try {
    const res = await fetch("/api/platform/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleSelections: selections }),
    });
    if (!res.ok) return null;
    return (await res.json()).data as QuoteResult;
  } catch {
    return null;
  }
}

export default function PublicQuotePage() {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QuotePageInner />
    </NextIntlClientProvider>
  );
}

function QuotePageInner() {
  const [modules, setModules] = useState<PricedModule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selections, setSelections] = useState<ModuleSelection[]>([]);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Lazy-load modules on mount
  useState(() => {
    fetchPublicModules().then((m) => { setModules(m); setLoaded(true); });
  });

  const currency = quote?.currency ?? "ETB";

  async function handleGetQuote() {
    if (selections.length === 0) return;
    setCalculating(true);
    const result = await computeQuote(selections);
    setQuote(result);
    setCalculating(false);
  }

  const totalRaw = quote?.total ?? 0;
  const totalDiscounted = applyDiscount(totalRaw, billingCycle);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
              O
            </div>
            <span className="text-sm font-semibold">OkraMed</span>
          </div>
          <Link
            href="/platform/tenants/new"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Calculate Your Price</h1>
          <p className="mt-3 text-[var(--muted-foreground)]">
            Select the modules your clinic needs and see the monthly cost instantly.
          </p>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : modules.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-10 text-center text-[var(--muted-foreground)]">
            <p>Module pricing is not available right now. Please try again later.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <ModuleSelector
              modules={modules}
              selections={selections}
              billingCycle={billingCycle}
              baseFee={0}
              currency={currency}
              onChange={setSelections}
              onCycleChange={setBillingCycle}
            />

            <div className="flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={handleGetQuote}
                disabled={selections.length === 0 || calculating}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {calculating ? <><Loader2 size={16} className="animate-spin" /> Calculating…</> : "Get My Quote"}
              </button>

              {quote && (
                <div className="w-full max-w-sm rounded-xl border border-[var(--accent)] bg-[var(--accent)]/5 p-6 text-center">
                  <p className="text-sm text-[var(--muted-foreground)] mb-1">Your estimated price</p>
                  <p className="text-4xl font-bold text-[var(--accent)] tabular-nums">
                    {formatMoney(totalDiscounted, currency)}
                    <span className="text-base font-normal text-[var(--muted-foreground)]">/mo</span>
                  </p>
                  {billingCycle !== "monthly" && (
                    <p className="mt-1 text-xs text-green-600">
                      Discount applied for {billingCycle === "six_months" ? "6-month" : "annual"} billing
                    </p>
                  )}
                  <Link
                    href="/platform/tenants/new"
                    className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Start Free Trial →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
