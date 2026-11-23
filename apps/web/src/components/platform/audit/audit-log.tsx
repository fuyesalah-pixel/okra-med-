"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Copy, Download, RotateCcw, ScrollText, Search } from "lucide-react";
import { platformRequest } from "../api-client";
import type { PlatformAuditData } from "../platform-types";
import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  formatDateTime,
} from "../ui";

const PAGE_SIZE = 50;

function isoDate(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

type Filters = {
  from: string;
  to: string;
  actorId: string;
  action: string;
  entityType: string;
  requestId: string;
};

const INITIAL: Filters = {
  from: isoDate(30),
  to: isoDate(0),
  actorId: "",
  action: "",
  entityType: "",
  requestId: "",
};

function toQuery(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", new Date(`${filters.from}T00:00:00.000Z`).toISOString());
  if (filters.to) query.set("to", new Date(`${filters.to}T23:59:59.999Z`).toISOString());
  if (filters.actorId) query.set("actorId", filters.actorId);
  if (filters.action) query.set("action", filters.action);
  if (filters.entityType) query.set("entityType", filters.entityType);
  if (filters.requestId.trim()) query.set("requestId", filters.requestId.trim());
  return query.toString();
}

export function AuditLog() {
  const t = useTranslations("platform.audit");
  const [draft, setDraft] = useState<Filters>(INITIAL);
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const queryString = useMemo(() => toQuery(filters), [filters]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PlatformAuditData>({
    queryKey: ["platform", "audit", queryString, page],
    queryFn: () =>
      platformRequest<PlatformAuditData>(
        `/api/platform/audit?${queryString}${queryString ? "&" : ""}limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      ),
    staleTime: 15_000,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const facets = data?.facets;

  function apply(next: Filters) {
    setFilters(next);
    setPage(0);
    setExpanded(null);
  }

  async function copyRequestId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
    } catch {
      // Clipboard permission can be denied; the id stays visible for manual copy.
    }
  }

  const csvHref = `/api/platform/audit?${queryString}${queryString ? "&" : ""}format=csv&limit=1000`;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("from")}
          <Input
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("to")}
          <Input
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("actor")}
          <Select
            value={draft.actorId}
            onChange={(event) => setDraft({ ...draft, actorId: event.target.value })}
            className="max-w-[200px]"
          >
            <option value="">{t("allActors")}</option>
            {(facets?.actors ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("action")}
          <Select
            value={draft.action}
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
            className="max-w-[200px]"
          >
            <option value="">{t("allActions")}</option>
            {(facets?.actions ?? []).map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("entityType")}
          <Select
            value={draft.entityType}
            onChange={(event) => setDraft({ ...draft, entityType: event.target.value })}
            className="max-w-[180px]"
          >
            <option value="">{t("allEntities")}</option>
            {(facets?.entityTypes ?? []).map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("requestId")}
          <Input
            value={draft.requestId}
            onChange={(event) => setDraft({ ...draft, requestId: event.target.value })}
            placeholder={t("requestIdPlaceholder")}
            className="font-mono"
          />
        </label>
        <Button type="submit" variant="primary">
          <Search size={14} aria-hidden />
          {t("apply")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setDraft(INITIAL);
            apply(INITIAL);
          }}
        >
          <RotateCcw size={14} aria-hidden />
          {t("reset")}
        </Button>
        <a
          href={csvHref}
          download="platform-audit.csv"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Download size={14} aria-hidden />
          {t("exportCsv")}
        </a>
      </form>

      {isError && <ErrorBanner message={t("errorLoad")} onRetry={() => refetch()} />}

      {!isError && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="w-8 px-2 py-2.5" />
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colTimestamp")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActor")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colAction")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colEntity")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colRequestId")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={6} />}
                {!isLoading &&
                  rows.map((row) => {
                    const open = expanded === row.id;
                    return (
                      <RowGroup key={row.id}>
                        <tr className="border-b border-[var(--border)] align-top last:border-0">
                          <td className="px-2 py-3">
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : row.id)}
                              aria-expanded={open}
                              aria-label={t("details")}
                              className="rounded p-1 text-[var(--muted-foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            >
                              {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-[var(--muted-foreground)]">{formatDateTime(row.createdAt)}</td>
                          <td className="px-4 py-3">
                            <p className="text-[var(--foreground)]">{row.actor}</p>
                            {row.actorEmail && (
                              <p className="text-xs text-[var(--muted-foreground)]">{row.actorEmail}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--foreground)]">{row.action}</td>
                          <td className="px-4 py-3 text-[var(--muted-foreground)]">
                            {row.entityType}
                            {row.entityId && (
                              <p className="truncate font-mono text-xs" title={row.entityId}>
                                {row.entityId}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.requestId ? (
                              <button
                                type="button"
                                onClick={() => copyRequestId(row.requestId!)}
                                className="inline-flex items-center gap-1 font-mono text-xs text-[var(--accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              >
                                <Copy size={12} aria-hidden />
                                {copied === row.requestId ? t("copied") : row.requestId.slice(0, 8)}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-[var(--border)] bg-[var(--muted)]/40">
                            <td />
                            <td colSpan={5} className="px-4 py-3">
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">{t("before")}</p>
                                  <pre className="overflow-x-auto rounded-lg bg-[var(--background)] p-3 text-xs text-[var(--foreground)]">
                                    {JSON.stringify(row.before ?? null, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">{t("after")}</p>
                                  <pre className="overflow-x-auto rounded-lg bg-[var(--background)] p-3 text-xs text-[var(--foreground)]">
                                    {JSON.stringify(row.after ?? null, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </RowGroup>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Mobile: each audit row is a card with the same expandable detail. */}
          <div className="divide-y divide-[var(--border)] md:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
                </div>
              ))}
            {!isLoading &&
              rows.map((row) => {
                const open = expanded === row.id;
                return (
                  <div key={row.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-[var(--foreground)]">{row.action}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{formatDateTime(row.createdAt)}</p>
                      </div>
                      <Button variant="ghost" onClick={() => setExpanded(open ? null : row.id)}>
                        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                        {t("details")}
                      </Button>
                    </div>
                    <p className="text-sm text-[var(--foreground)]">{row.actor}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {row.entityType}
                      {row.entityId ? ` · ${row.entityId}` : ""}
                    </p>
                    {open && (
                      <pre className="overflow-x-auto rounded-lg bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">
                        {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
          </div>

          {!isLoading && rows.length === 0 && (
            <EmptyState icon={ScrollText} title={t("empty")} hint={t("emptyHint")} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span aria-live="polite">
              {t("count", { count: total })} · {t("pageOf", { page: page + 1, pages })}
              {isFetching && <span className="ml-2 opacity-60">…</span>}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || isFetching}>
                {t("previous")}
              </Button>
              <Button
                onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                disabled={page >= pages - 1 || isFetching}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
