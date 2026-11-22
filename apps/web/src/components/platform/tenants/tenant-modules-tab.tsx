"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { replaceSubscriptionModules } from "./tenant-api";
import { formatMoney } from "./tenant-shared";
import type { ModuleCatalogItem, TenantDetailData } from "./tenant-types";

type Selection = { enabled: boolean; count: number };

export function TenantModulesTab({
  detail,
  catalog,
  catalogLoading,
}: {
  detail: TenantDetailData;
  catalog: ModuleCatalogItem[];
  catalogLoading: boolean;
}) {
  const t = useTranslations("platform.tenants.detail.modules");
  const queryClient = useQueryClient();
  const subscription = detail.subscription;
  const archived = detail.tenant.status === "archived";

  const initial = useMemo(() => {
    const map = new Map<string, Selection>();
    for (const item of detail.subscriptionItems) {
      map.set(item.moduleKey, { enabled: true, count: item.instanceCount });
    }
    return map;
  }, [detail.subscriptionItems]);

  const [selection, setSelection] = useState<Map<string, Selection>>(() => new Map(initial));

  useEffect(() => {
    setSelection(new Map(initial));
  }, [initial]);

  const currency = detail.bill?.currency ?? "ETB";
  const baseFee = detail.bill?.base_fee ?? 0;

  const visibleModules = catalog.filter(
    (module) => module.isActive || initial.has(module.key),
  );

  const newLines = visibleModules
    .map((module) => {
      const chosen = selection.get(module.key);
      if (!chosen?.enabled) return null;
      return {
        key: module.key,
        name: module.name,
        count: Math.max(1, chosen.count),
        unitPrice: module.pricing?.instancePrice ?? 0,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  const newTotal = baseFee + newLines.reduce((sum, line) => sum + line.count * line.unitPrice, 0);
  const currentTotal = detail.bill?.total ?? 0;
  const delta = newTotal - currentTotal;

  const mutation = useMutation({
    mutationFn: () => {
      if (!subscription) throw new Error("No subscription");
      return replaceSubscriptionModules(
        subscription.id,
        newLines.map((line) => ({ key: line.key, count: line.count })),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenant", detail.tenant.id] });
    },
  });

  if (!subscription) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        {t("atLeastOne")}
      </div>
    );
  }

  function toggle(key: string) {
    setSelection((previous) => {
      const next = new Map(previous);
      const current = next.get(key);
      next.set(key, {
        enabled: !current?.enabled,
        count: current?.count ?? 1,
      });
      return next;
    });
  }

  function setCount(key: string, value: number) {
    setSelection((previous) => {
      const next = new Map(previous);
      next.set(key, { enabled: true, count: Math.max(1, value) });
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--card-foreground)]">{t("title")}</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t("hint")}</p>
        {archived && (
          <p className="mt-2 text-sm text-[var(--warning)]">{t("archivedHint")}</p>
        )}
      </div>

      {catalogLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--muted)]"
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t("enabled")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("module")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("price")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("instances")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleModules.map((module) => {
                const chosen = selection.get(module.key);
                const enabled = Boolean(chosen?.enabled);
                return (
                  <tr key={module.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={archived}
                        onChange={() => toggle(module.key)}
                        aria-label={`${t("enabled")}: ${module.name}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{module.name}</span>
                      <span className="ml-2 font-mono text-xs text-[var(--muted-foreground)]">
                        {module.key}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--muted-foreground)]">
                      {module.pricing
                        ? formatMoney(module.pricing.instancePrice, module.pricing.currency)
                        : t("noPricing")}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={chosen?.count ?? 1}
                        disabled={!enabled || archived}
                        onChange={(event) => setCount(module.key, Number(event.target.value))}
                        aria-label={`${t("instances")}: ${module.name}`}
                        className="w-20 rounded-lg border border-[var(--input)] bg-[var(--background)] px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
        <dl className="flex flex-wrap gap-6">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              {t("currentTotal")}
            </dt>
            <dd className="mt-0.5 font-medium">{formatMoney(currentTotal, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              {t("newTotal")}
            </dt>
            <dd className="mt-0.5 font-semibold">{formatMoney(newTotal, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              {t("delta")}
            </dt>
            <dd
              className={[
                "mt-0.5 font-medium",
                delta === 0
                  ? "text-[var(--muted-foreground)]"
                  : delta > 0
                    ? "text-[var(--warning)]"
                    : "text-[var(--success)]",
              ].join(" ")}
            >
              {delta > 0 ? "+" : ""}
              {formatMoney(delta, currency)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={archived || mutation.isPending || newLines.length === 0}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {mutation.isPending ? t("saving") : t("save")}
          </button>
          {newLines.length === 0 && (
            <span className="text-xs text-[var(--destructive)]">{t("atLeastOne")}</span>
          )}
        </div>
      </div>

      {mutation.isSuccess && (
        <p role="status" className="text-sm text-[var(--success)]">{t("saved")}</p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {mutation.error.message || t("error")}
        </p>
      )}
    </div>
  );
}
