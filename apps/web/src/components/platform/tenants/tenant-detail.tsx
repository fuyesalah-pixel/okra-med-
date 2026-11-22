"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, Copy, ExternalLink, ShieldAlert, Users } from "lucide-react";
import {
  archiveTenant,
  fetchModules,
  fetchTenant,
  impersonate,
  reactivateTenant,
  suspendTenant,
} from "./tenant-api";
import { TenantAuditTab } from "./tenant-audit-tab";
import { TenantModulesTab } from "./tenant-modules-tab";
import { TenantSettingsTab } from "./tenant-settings-tab";
import { TenantSubscriptionTab } from "./tenant-subscription-tab";
import { ConfirmDialog, formatDate, formatMoney, StatusBadge } from "./tenant-shared";
import type { ModuleCatalogItem, TenantDetailData } from "./tenant-types";

type Tab = "overview" | "settings" | "subscription" | "modules" | "audit" | "danger";
const TABS: Tab[] = ["overview", "settings", "subscription", "modules", "audit", "danger"];

type PendingAction = "suspend" | "archive" | "reactivate" | null;

export function TenantDetail({ id }: { id: string }) {
  const t = useTranslations("platform.tenants.detail");
  const tOverview = useTranslations("platform.tenants.detail.overview");
  const tDanger = useTranslations("platform.tenants.detail.danger");
  const tDashboard = useTranslations("platform.dashboard");
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [typedSlug, setTypedSlug] = useState("");
  const [reason, setReason] = useState("");
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impersonateUser, setImpersonateUser] = useState("");

  const detailQuery = useQuery<TenantDetailData>({
    queryKey: ["platform", "tenant", id],
    queryFn: () => fetchTenant(id),
    staleTime: 15_000,
  });

  const modulesQuery = useQuery<ModuleCatalogItem[]>({
    queryKey: ["platform", "modules"],
    queryFn: fetchModules,
    staleTime: 60_000,
  });

  const detail = detailQuery.data;
  const slugMatches = detail ? typedSlug === detail.tenant.slug : false;
  const hasActiveSubscription =
    detail?.subscription?.status === "trialing" || detail?.subscription?.status === "active";

  const actionMutation = useMutation({
    mutationFn: async (action: Exclude<PendingAction, null>) => {
      if (!detail) throw new Error("Tenant not loaded");
      if (action === "suspend") return suspendTenant(detail.tenant.id, reason.trim());
      if (action === "archive") return archiveTenant(detail.tenant.id, reason.trim());
      return reactivateTenant(detail.tenant.id);
    },
    onSuccess: async () => {
      setPending(null);
      setTypedSlug("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenant", detail?.tenant.id] });
      await queryClient.invalidateQueries({ queryKey: ["platform", "tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["platform", "dashboard"] });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: () => {
      if (!detail || !impersonateUser) throw new Error("Select a user");
      return impersonate(detail.tenant.id, impersonateUser);
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-11 w-full animate-pulse rounded bg-[var(--muted)]" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-[var(--muted)]" />
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="mx-auto max-w-7xl">
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-surface)] p-4 text-sm text-[var(--destructive-surface-foreground)]"
        >
          <p>{t("errorLoad")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => detailQuery.refetch()}
              className="rounded-lg border border-current px-3 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {tDashboard("retry")}
            </button>
            <Link
              href="/platform/tenants"
              className="rounded-lg border border-current px-3 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {t("back")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { tenant, subscription, bill, subscriptionItems, users } = detail;
  const activeMembers = users.members.filter((member) => member.isActive);

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(tenant.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function openAction(action: Exclude<PendingAction, null>) {
    setTypedSlug("");
    setReason("");
    actionMutation.reset();
    setPending(action);
  }

  const actionTitle =
    pending === "suspend"
      ? tDanger("suspendTitle", { name: tenant.name })
      : pending === "archive"
        ? tDanger("archiveTitle", { name: tenant.name })
        : tDanger("reactivateTitle", { name: tenant.name });

  const actionDisabled =
    actionMutation.isPending ||
    (pending === "archive" && (!slugMatches || hasActiveSubscription)) ||
    (pending === "suspend" && (!slugMatches || reason.trim().length < 3));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <Link
        href="/platform/tenants"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--muted-foreground)] outline-none hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ArrowLeft size={15} aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {tenant.name}
            </h2>
            <StatusBadge status={tenant.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--muted-foreground)]">
            <span className="font-mono">{tenant.slug}</span>
            <button
              type="button"
              onClick={copySlug}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? t("copied") : t("copySlug")}
            </button>
            <span>·</span>
            <span>{t("created", { date: formatDate(tenant.createdAt) })}</span>
          </div>
          {tenant.suspendedReason && (
            <p className="mt-2 rounded-lg bg-[var(--destructive-surface)] px-3 py-1.5 text-sm text-[var(--destructive-surface-foreground)]">
              {tOverview("suspendedReason")}: {tenant.suspendedReason}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            impersonateMutation.reset();
            setImpersonateUser(activeMembers[0]?.id ?? "");
            setImpersonateOpen(true);
          }}
          disabled={tenant.status === "archived" || activeMembers.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          <Users size={15} aria-hidden />
          {t("impersonate")}
        </button>
      </div>

      <div role="tablist" aria-label={tenant.name} className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            onClick={() => setTab(value)}
            className={[
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              tab === value
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {t(`tabs.${value}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
                {tOverview("contact")}
              </h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  [tOverview("email"), tenant.contactEmail ?? tOverview("notSet")],
                  [tOverview("phone"), tenant.contactPhone ?? tOverview("notSet")],
                  [tOverview("country"), tenant.country],
                  [tOverview("users"), tOverview("userBreakdown", { active: users.active, total: users.total })],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {label}
                    </dt>
                    <dd className="mt-0.5">{value}</dd>
                  </div>
                ))}
                {tenant.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {tOverview("notes")}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap">{tenant.notes}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
                {tOverview("dates")}
              </h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  [tOverview("created"), formatDate(tenant.createdAt)],
                  [tOverview("provisioned"), formatDate(tenant.provisionedAt)],
                  [tOverview("trialEnds"), formatDate(tenant.trialEndsAt)],
                  [tOverview("nextInvoice"), formatDate(subscription?.nextInvoiceAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {label}
                    </dt>
                    <dd className="mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
                  {tOverview("subscription")}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab("subscription")}
                  className="text-sm text-[var(--accent)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {tOverview("manageSubscription")}
                </button>
              </div>
              {subscription && bill ? (
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {tOverview("subscriptionStatus")}
                    </dt>
                    <dd className="mt-0.5">
                      {t(`subscription.statusLabels.${subscription.status}`)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {tOverview("billingCycle")}
                    </dt>
                    <dd className="mt-0.5">
                      {t(`subscription.cycleLabels.${subscription.billingCycle}`)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {tOverview("trialEnds")}
                    </dt>
                    <dd className="mt-0.5">{formatDate(subscription.trialEndsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {tOverview("nextInvoice")}
                    </dt>
                    <dd className="mt-0.5">{formatDate(subscription.nextInvoiceAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      {t("subscription.total")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold">
                      {formatMoney(bill.total, bill.currency)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  {tOverview("noSubscription")}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
                  {tOverview("modules")}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab("modules")}
                  className="text-sm text-[var(--accent)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {t("tabs.modules")}
                </button>
              </div>
              {subscriptionItems.length > 0 ? (
                <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
                  {subscriptionItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <span>{item.moduleName}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {tOverview("instanceCount", { count: item.instanceCount })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  {tOverview("noModules")}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-[var(--card-foreground)]">
                {tOverview("quickActions")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/${tenant.slug}/dashboard`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <ExternalLink size={14} aria-hidden />
                  {tOverview("viewTenant")}
                </Link>
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {tOverview("editSettings")}
                </button>
                {tenant.status === "suspended" || tenant.status === "archived" ? (
                  <button
                    type="button"
                    onClick={() => openAction("reactivate")}
                    disabled={tenant.status === "archived"}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                  >
                    {tDanger("reactivate")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAction("suspend")}
                    className="rounded-lg border border-[var(--warning)] px-3 py-1.5 text-sm font-medium text-[var(--warning)] outline-none hover:bg-[var(--warning-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {tDanger("suspend")}
                  </button>
                )}
                {tenant.status !== "archived" && (
                  <button
                    type="button"
                    onClick={() => openAction("archive")}
                    disabled={hasActiveSubscription}
                    title={hasActiveSubscription ? tDanger("archiveBlocked") : undefined}
                    className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-sm font-medium text-[var(--destructive)] outline-none hover:bg-[var(--destructive-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                  >
                    {tDanger("archive")}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "settings" && <TenantSettingsTab detail={detail} />}

        {tab === "subscription" && (
          <TenantSubscriptionTab detail={detail} onManageModules={() => setTab("modules")} />
        )}

        {tab === "modules" && (
          <TenantModulesTab
            detail={detail}
            catalog={modulesQuery.data ?? []}
            catalogLoading={modulesQuery.isLoading}
          />
        )}

        {tab === "audit" && <TenantAuditTab tenantId={tenant.id} slug={tenant.slug} />}

        {tab === "danger" && (
          <div className="flex max-w-2xl flex-col gap-4">
            <div className="rounded-xl border border-[var(--warning)]/50 bg-[var(--warning-surface)] p-4 text-sm text-[var(--warning-surface-foreground)]">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert size={16} aria-hidden />
                {tDanger("title")}
              </p>
              <p className="mt-1">{tDanger("suspendHint")}</p>
            </div>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div>
                <h3 className="text-sm font-semibold">{tDanger("suspend")}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{tDanger("suspendHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => openAction("suspend")}
                disabled={tenant.status === "suspended" || tenant.status === "archived"}
                className="rounded-lg border border-[var(--warning)] px-3 py-1.5 text-sm font-medium text-[var(--warning)] outline-none hover:bg-[var(--warning-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {tDanger("suspend")}
              </button>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div>
                <h3 className="text-sm font-semibold">{tDanger("reactivate")}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{tDanger("reactivateHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => openAction("reactivate")}
                disabled={tenant.status !== "suspended"}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {tDanger("reactivate")}
              </button>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--destructive)] bg-[var(--card)] p-4">
              <div>
                <h3 className="text-sm font-semibold">{tDanger("archive")}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {hasActiveSubscription ? tDanger("archiveBlocked") : tDanger("archiveHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAction("archive")}
                disabled={tenant.status === "archived" || hasActiveSubscription}
                className="rounded-lg border border-[var(--destructive)] px-3 py-1.5 text-sm font-medium text-[var(--destructive)] outline-none hover:bg-[var(--destructive-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {tDanger("archive")}
              </button>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
              <div>
                <h3 className="text-sm font-semibold">{tDanger("delete")}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{tDanger("deleteHint")}</p>
              </div>
              <button
                type="button"
                disabled
                title={tDanger("deleteHint")}
                className="cursor-not-allowed rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium opacity-50"
              >
                {tDanger("delete")}
              </button>
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={actionTitle}
        description={
          pending === "suspend"
            ? tDanger("suspendHint")
            : pending === "archive"
              ? hasActiveSubscription
                ? tDanger("archiveBlocked")
                : tDanger("archiveHint")
              : tDanger("reactivateHint")
        }
        confirmLabel={pending === "reactivate" ? tDanger("confirm") : tDanger("confirm")}
        busyLabel={tDanger("working")}
        busy={actionMutation.isPending}
        destructive={pending !== "reactivate"}
        confirmDisabled={pending === "reactivate" ? false : actionDisabled}
        onConfirm={() => pending && actionMutation.mutate(pending)}
        onClose={() => setPending(null)}
      >
        <div className="flex flex-col gap-3">
          {pending === "suspend" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{tDanger("suspendReason")}</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
          )}
          {pending === "archive" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{tDanger("archiveReason")}</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
          )}
          {pending !== "reactivate" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {tDanger("typeSlug", { slug: tenant.slug })}
              </span>
              <input
                value={typedSlug}
                onChange={(event) => setTypedSlug(event.target.value)}
                autoComplete="off"
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
          )}
          {actionMutation.isError && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {actionMutation.error.message || tDanger("actionError")}
            </p>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={impersonateOpen}
        title={t("impersonateTitle")}
        description={t("impersonateHint")}
        confirmLabel={t("startImpersonation")}
        busyLabel={tDanger("working")}
        busy={impersonateMutation.isPending}
        confirmDisabled={!impersonateUser}
        onConfirm={() => impersonateMutation.mutate()}
        onClose={() => setImpersonateOpen(false)}
      >
        <div className="flex flex-col gap-3">
          {activeMembers.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("noActiveUsers")}</p>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("selectUser")}</span>
              <select
                value={impersonateUser}
                onChange={(event) => setImpersonateUser(event.target.value)}
                className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          {impersonateMutation.isSuccess && (
            <p role="status" className="text-sm text-[var(--success)]">
              {t("impersonationStarted", {
                time: new Date(impersonateMutation.data.expiresAt).toLocaleTimeString(),
              })}
            </p>
          )}
          {impersonateMutation.isError && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {impersonateMutation.error.message}
            </p>
          )}
        </div>
      </ConfirmDialog>

    </div>
  );
}
