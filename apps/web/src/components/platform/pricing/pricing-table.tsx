"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, DollarSign, Pencil } from "lucide-react";
import { errorMessage, platformRequest } from "../api-client";
import type { ModuleRow, PricingHistoryRow } from "../platform-types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  PageHeader,
  SkeletonRows,
  formatDateTime,
  formatMinor,
} from "../ui";

function PricingHistory({
  moduleId,
  currency,
}: {
  moduleId: string;
  currency: string;
}) {
  const t = useTranslations("platform.pricing");
  const { data, isLoading, isError, refetch } = useQuery<PricingHistoryRow[]>({
    queryKey: ["platform", "module", moduleId, "pricing"],
    queryFn: () => platformRequest<PricingHistoryRow[]>(`/api/platform/modules/${moduleId}/pricing`),
    staleTime: 10_000,
  });

  if (isLoading) {
    return <p className="py-2 text-sm text-[var(--muted-foreground)]">{t("loadingHistory")}</p>;
  }
  if (isError) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="text-sm text-[var(--destructive)] underline"
      >
        {t("historyError")}
      </button>
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-[var(--muted-foreground)]">{t("noHistory")}</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead className="text-[var(--muted-foreground)]">
        <tr>
          <th className="py-1.5 pr-4 font-medium">{t("historyWhen")}</th>
          <th className="py-1.5 pr-4 font-medium">{t("historyOld")}</th>
          <th className="py-1.5 pr-4 font-medium">{t("historyNew")}</th>
          <th className="py-1.5 pr-4 font-medium">{t("historyActor")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          // Rows are newest first, so the next row is the price it replaced.
          const previous = rows[index + 1];
          return (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="py-1.5 pr-4 text-[var(--foreground)]">{formatDateTime(row.createdAt)}</td>
              <td className="py-1.5 pr-4 text-[var(--muted-foreground)]">
                {previous ? formatMinor(previous.instancePrice, previous.currency) : "—"}
              </td>
              <td className="py-1.5 pr-4 font-medium text-[var(--foreground)]">
                {formatMinor(row.instancePrice, row.currency)}
                {row.isActive && <span className="ml-2 text-[var(--success)]">•</span>}
              </td>
              <td className="py-1.5 pr-4 text-[var(--muted-foreground)]">
                {row.actorName ?? t("seeded")}
                {!row.isActive && <span className="ml-2">({t("retired")})</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="pt-2 text-[var(--muted-foreground)]">
            {t("historyCurrency", { currency })}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function PricingTable() {
  const t = useTranslations("platform.pricing");
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ module: ModuleRow; minor: number } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<ModuleRow[]>({
    queryKey: ["platform", "modules"],
    queryFn: () => platformRequest<ModuleRow[]>("/api/platform/modules"),
    staleTime: 15_000,
  });

  const rows = data ?? [];

  const saveMutation = useMutation({
    mutationFn: ({ module, minor }: { module: ModuleRow; minor: number }) =>
      platformRequest(`/api/platform/modules/${module.id}/pricing`, {
        method: "PUT",
        body: JSON.stringify({
          instancePrice: minor,
          currency: module.pricing?.currency ?? "ETB",
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "modules"] });
      await queryClient.invalidateQueries({ queryKey: ["platform", "module"] });
      setPending(null);
      setEditingId(null);
    },
    onError: (error) => setSaveError(errorMessage(error, t("saveError"))),
  });

  function beginEdit(row: ModuleRow) {
    setEditingId(row.id);
    setDraft(((row.pricing?.instancePrice ?? 0) / 100).toFixed(2));
    setSaveError("");
  }

  function commitEdit(row: ModuleRow) {
    const major = Number(draft);
    if (!Number.isFinite(major) || major < 0) {
      setSaveError(t("invalidPrice"));
      return;
    }
    const minor = Math.round(major * 100);
    if (minor === (row.pricing?.instancePrice ?? -1)) {
      setEditingId(null);
      return;
    }
    setSaveError("");
    setPending({ module: row, minor });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {saveError && !pending && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {saveError}
        </p>
      )}

      {isError && <ErrorBanner message={t("errorLoad")} onRetry={() => refetch()} />}

      {!isError && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colModule")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colPrice")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colCurrency")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colUpdated")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={5} />}
                {!isLoading &&
                  rows.map((row) => {
                    const editing = editingId === row.id;
                    const expanded = openHistory === row.id;
                    return (
                      <RowGroup
                        key={row.id}
                        row={row}
                        editing={editing}
                        expanded={expanded}
                        draft={draft}
                        onDraft={setDraft}
                        onBegin={() => beginEdit(row)}
                        onCancel={() => {
                          setEditingId(null);
                          setSaveError("");
                        }}
                        onCommit={() => commitEdit(row)}
                        onToggleHistory={() => setOpenHistory(expanded ? null : row.id)}
                      />
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--border)] md:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 p-4">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--muted)]" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-[var(--muted)]" />
                </div>
              ))}
            {!isLoading &&
              rows.map((row) => {
                const editing = editingId === row.id;
                return (
                <div key={row.id} className="flex flex-col gap-2 p-4">
                  <p className="font-medium text-[var(--foreground)]">{row.name}</p>
                  <p className="text-sm text-[var(--foreground)]">
                    {row.pricing
                      ? formatMinor(row.pricing.instancePrice, row.pricing.currency)
                      : t("noPrice")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => beginEdit(row)}>
                      <Pencil size={14} aria-hidden />
                      {t("edit")}
                    </Button>
                    <Button onClick={() => setOpenHistory(openHistory === row.id ? null : row.id)}>
                      {t("history")}
                    </Button>
                  </div>
                  {editing && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label={t("colPrice")}
                      />
                      <Button variant="primary" onClick={() => commitEdit(row)}>
                        {t("save")}
                      </Button>
                    </div>
                  )}
                  {openHistory === row.id && (
                    <div className="pt-2">
                      <PricingHistory moduleId={row.id} currency={row.pricing?.currency ?? "ETB"} />
                    </div>
                  )}
                </div>
                );
              })}
          </div>

          {!isLoading && rows.length === 0 && (
            <EmptyState icon={DollarSign} title={t("empty")} hint={t("emptyHint")} />
          )}
        </div>
      )}

      <Modal
        open={Boolean(pending)}
        onClose={() => !saveMutation.isPending && setPending(null)}
        title={t("confirmTitle")}
        description={t("confirmBody")}
        busy={saveMutation.isPending}
        footer={
          <>
            <Button onClick={() => setPending(null)} disabled={saveMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => pending && saveMutation.mutate(pending)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("saving") : t("confirm")}
            </Button>
          </>
        }
      >
        {pending && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-[var(--muted-foreground)]">{t("colModule")}</dt>
            <dd className="font-medium text-[var(--foreground)]">{pending.module.name}</dd>
            <dt className="text-[var(--muted-foreground)]">{t("historyOld")}</dt>
            <dd className="text-[var(--foreground)]">
              {pending.module.pricing
                ? formatMinor(pending.module.pricing.instancePrice, pending.module.pricing.currency)
                : t("noPrice")}
            </dd>
            <dt className="text-[var(--muted-foreground)]">{t("historyNew")}</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {formatMinor(pending.minor, pending.module.pricing?.currency ?? "ETB")}
            </dd>
          </dl>
        )}
        {saveError && (
          <p role="alert" className="mt-3 text-sm text-[var(--destructive)]">
            {saveError}
          </p>
        )}
      </Modal>
    </div>
  );
}

function RowGroup({
  row,
  editing,
  expanded,
  draft,
  onDraft,
  onBegin,
  onCancel,
  onCommit,
  onToggleHistory,
}: {
  row: ModuleRow;
  editing: boolean;
  expanded: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onBegin: () => void;
  onCancel: () => void;
  onCommit: () => void;
  onToggleHistory: () => void;
}) {
  const t = useTranslations("platform.pricing");

  return (
    <>
      <tr className="border-b border-[var(--border)] last:border-0">
        <td className="px-4 py-3">
          <p className="font-medium text-[var(--foreground)]">{row.name}</p>
          <p className="font-mono text-xs text-[var(--muted-foreground)]">{row.key}</p>
        </td>
        <td className="px-4 py-3">
          {editing ? (
            <Input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              autoFocus
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommit();
                }
                if (event.key === "Escape") onCancel();
              }}
              aria-label={t("colPrice")}
              className="w-36"
            />
          ) : (
            <button
              type="button"
              onClick={onBegin}
              className="rounded text-left font-medium text-[var(--foreground)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {row.pricing
                ? formatMinor(row.pricing.instancePrice, row.pricing.currency)
                : t("noPrice")}
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-[var(--muted-foreground)]">
          {row.pricing?.currency ?? "—"}
        </td>
        <td className="px-4 py-3 text-[var(--muted-foreground)]">
          {formatDateTime(row.pricing?.updatedAt ?? null)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button variant="primary" onClick={onCommit}>
                  {t("save")}
                </Button>
                <Button onClick={onCancel}>{t("cancel")}</Button>
              </>
            ) : (
              <>
                <Button onClick={onBegin}>
                  <Pencil size={14} aria-hidden />
                  {t("edit")}
                </Button>
                <Button variant="ghost" onClick={onToggleHistory}>
                  {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  {t("history")}
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--border)] bg-[var(--muted)]/40">
          <td colSpan={5} className="px-6 py-3">
            <PricingHistory moduleId={row.id} currency={row.pricing?.currency ?? "ETB"} />
          </td>
        </tr>
      )}
    </>
  );
}
