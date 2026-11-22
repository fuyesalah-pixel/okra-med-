"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Download, RotateCcw, Search } from "lucide-react";
import { fetchTenantAudit } from "./tenant-api";
import { formatDateTime } from "./tenant-shared";

const PAGE_SIZE = 50;

export function TenantAuditTab({ tenantId, slug }: { tenantId: string; slug: string }) {
  const t = useTranslations("platform.tenants.detail.audit");
  const tDashboard = useTranslations("platform.dashboard");
  const tList = useTranslations("platform.tenants");

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [filters, setFilters] = useState<{ from: string; to: string; action: string }>({
    from: "",
    to: "",
    action: "",
  });
  const [page, setPage] = useState(0);

  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).toISOString() : "";
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).toISOString() : "";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["platform", "tenant", tenantId, "audit", from, to, filters.action, page],
    queryFn: () =>
      fetchTenantAudit(tenantId, {
        from: from || undefined,
        to: to || undefined,
        action: filters.action || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 15_000,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const csvQuery = new URLSearchParams({ format: "csv", limit: "1000" });
  if (from) csvQuery.set("from", from);
  if (to) csvQuery.set("to", to);
  if (filters.action) csvQuery.set("action", filters.action);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("title")}</h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ from: fromInput, to: toInput, action: actionInput });
          setPage(0);
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("from")}
          <input
            type="date"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("to")}
          <input
            type="date"
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("action")}
          <input
            value={actionInput}
            onChange={(event) => setActionInput(event.target.value)}
            placeholder={t("actionPlaceholder")}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Search size={14} aria-hidden />
          {t("apply")}
        </button>
        <button
          type="button"
          onClick={() => {
            setFromInput("");
            setToInput("");
            setActionInput("");
            setFilters({ from: "", to: "", action: "" });
            setPage(0);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <RotateCcw size={14} aria-hidden />
          {t("reset")}
        </button>
        <a
          href={`/api/platform/tenants/${tenantId}/audit?${csvQuery.toString()}`}
          download={`tenant-${slug}-audit.csv`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Download size={14} aria-hidden />
          {t("exportCsv")}
        </a>
      </form>

      {isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-surface)] p-4 text-sm text-[var(--destructive-surface-foreground)]"
        >
          <p>{t("error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-current px-3 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {tDashboard("retry")}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{t("timestamp")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("actor")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("actionCol")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("entity")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("requestId")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-[var(--border)] last:border-0">
                      {Array.from({ length: 5 }).map((__, cell) => (
                        <td key={cell} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-[var(--muted)]" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!isLoading &&
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--muted-foreground)]">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[var(--foreground)]">{row.actor}</span>
                        {row.actorEmail && (
                          <span className="block text-xs text-[var(--muted-foreground)]">
                            {row.actorEmail}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{row.action}</td>
                      <td className="px-4 py-2.5 text-[var(--muted-foreground)]">
                        {row.entityType}
                        {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">
                        {row.requestId ? row.requestId.slice(0, 8) : "—"}
                      </td>
                    </tr>
                  ))}

                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                      {t("empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span>
              {t("count", { count: total })}
              {isFetching && <span className="ml-2 opacity-60">…</span>}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0 || isFetching}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {tList("previous")}
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                disabled={page >= pages - 1 || isFetching}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {tList("next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
