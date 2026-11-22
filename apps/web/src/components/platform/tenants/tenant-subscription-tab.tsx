"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CreditCard, Pencil, RefreshCw, XCircle } from "lucide-react";
import { subscriptionAction } from "./tenant-api";
import { ConfirmDialog, formatDate, formatMoney } from "./tenant-shared";
import type { TenantDetailData } from "./tenant-types";

export function TenantSubscriptionTab({
  detail,
  onManageModules,
}: {
  detail: TenantDetailData;
  onManageModules: () => void;
}) {
  const t = useTranslations("platform.tenants.detail.subscription");
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"renew" | "cancel" | null>(null);

  const subscription = detail.subscription;
  const bill = detail.bill;

  const mutation = useMutation({
    mutationFn: (next: "renew" | "cancel") => {
      if (!subscription) throw new Error("No subscription");
      return subscriptionAction(subscription.id, next);
    },
    onSuccess: async () => {
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenant", detail.tenant.id] });
    },
  });

  if (!subscription) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        {t("noSubscription")}
      </div>
    );
  }

  const moduleNames = new Map(detail.subscriptionItems.map((item) => [item.moduleKey, item.moduleName]));

  const rows = [
    [t("status"), t(`statusLabels.${subscription.status}`)],
    [t("cycle"), t(`cycleLabels.${subscription.billingCycle}`)],
    [t("starts"), formatDate(subscription.startsAt)],
    [t("ends"), formatDate(subscription.endsAt)],
    [t("trialEnds"), formatDate(subscription.trialEndsAt)],
    [t("nextInvoice"), formatDate(subscription.nextInvoiceAt)],
    ...(subscription.gracePeriodEndsAt
      ? [[t("graceEnds"), formatDate(subscription.gracePeriodEndsAt)] as [string, string]]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--card-foreground)]">
            <CreditCard size={16} aria-hidden />
            {t("title")}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAction("renew")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <RefreshCw size={14} aria-hidden />
              {t("renew")}
            </button>
            <button
              type="button"
              onClick={() => setAction("cancel")}
              disabled={subscription.status === "canceled" || subscription.status === "expired"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-sm font-medium text-[var(--destructive)] outline-none hover:bg-[var(--destructive-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              <XCircle size={14} aria-hidden />
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={onManageModules}
              disabled={detail.tenant.status === "archived"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-foreground)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              <Pencil size={14} aria-hidden />
              {t("changeModules")}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                {label}
              </dt>
              <dd className="mt-0.5 text-[var(--foreground)]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <h3 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--card-foreground)]">
          {t("lineItems")}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t("module")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("instances")}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t("unitPrice")}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t("subtotal")}</th>
              </tr>
            </thead>
            <tbody>
              {(bill?.lines ?? []).map((line) => (
                <tr key={line.module} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5">{moduleNames.get(line.module) ?? line.module}</td>
                  <td className="px-4 py-2.5">{line.instance_count}</td>
                  <td className="px-4 py-2.5">{formatMoney(line.unit_price, bill!.currency)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {formatMoney(line.subtotal, bill!.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--muted)]/50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-xs text-[var(--muted-foreground)]">
                  {t("baseFee")}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatMoney(bill?.base_fee ?? 0, bill?.currency ?? "")}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right font-semibold">
                  {t("total")}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold">
                  {formatMoney(bill?.total ?? 0, bill?.currency ?? "")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {mutation.isError && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {mutation.error.message || t("actionError")}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm text-[var(--success)]">
          {t("actionSuccess")}
        </p>
      )}

      <ConfirmDialog
        open={action === "renew"}
        title={t("renewTitle")}
        description={t("renewHint")}
        confirmLabel={t("renew")}
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate("renew")}
        onClose={() => setAction(null)}
      />
      <ConfirmDialog
        open={action === "cancel"}
        title={t("cancelTitle")}
        description={t("cancelHint")}
        confirmLabel={t("cancel")}
        destructive
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate("cancel")}
        onClose={() => setAction(null)}
      />
    </div>
  );
}
