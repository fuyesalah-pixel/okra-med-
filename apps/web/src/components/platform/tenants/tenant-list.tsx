"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Building2, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { fetchTenants } from "./tenant-api";
import { formatDate, StatusBadge } from "./tenant-shared";
import type { TenantListData } from "./tenant-types";

const PAGE_SIZE = 20;
const STATUSES = ["trial", "active", "suspended", "archived"] as const;

export function TenantList({ initialSearch = "" }: { initialSearch?: string }) {
  const t = useTranslations("platform.tenants");
  const tDashboard = useTranslations("platform.dashboard");
  const router = useRouter();

  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(0);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<TenantListData>({
    queryKey: ["platform", "tenants", search, status, sort, page],
    queryFn: () => fetchTenants({ search, status, sort, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search.trim().length > 0 || status.length > 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            {t("title")}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">{t("subtitle")}</p>
        </div>
        <Link
          href="/platform/tenants/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Plus size={16} aria-hidden />
          {t("newTenant")}
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("searchPlaceholder")}
          <span className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("statusFilter")}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted-foreground)]">
          {t("sort")}
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <option value="created_desc">{t("sortCreatedDesc")}</option>
            <option value="created_asc">{t("sortCreatedAsc")}</option>
            <option value="name_asc">{t("sortNameAsc")}</option>
            <option value="name_desc">{t("sortNameDesc")}</option>
          </select>
        </label>
      </div>

      {isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-surface)] p-4 text-sm text-[var(--destructive-surface-foreground)]"
        >
          <p>{t("errorLoad")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-current px-3 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {tDashboard("retry")}
          </button>
        </div>
      )}

      {!isError && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colName")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colSlug")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colModules")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colCreated")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="border-b border-[var(--border)] last:border-0">
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <td key={cell} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-[var(--muted)]" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!isLoading &&
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/platform/tenants/${row.id}`)}
                      className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/platform/tenants/${row.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-[var(--foreground)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          {row.name}
                        </Link>
                        {row.contactEmail && (
                          <p className="text-xs text-[var(--muted-foreground)]">{row.contactEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">
                        {row.slug}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {t("moduleCount", { count: row.moduleCount })}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/platform/tenants/${row.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-[var(--accent)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          {t("view")}
                        </Link>
                      </td>
                    </tr>
                  ))}

                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Building2
                        size={28}
                        aria-hidden
                        className="mx-auto text-[var(--muted-foreground)]"
                      />
                      <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                        {hasFilters ? t("noMatches") : t("noTenants")}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {hasFilters ? t("noMatchesHint") : t("noTenantsHint")}
                      </p>
                      {hasFilters ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput("");
                            setSearch("");
                            setStatus("");
                            setPage(0);
                          }}
                          className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          {t("clearFilters")}
                        </button>
                      ) : (
                        <Link
                          href="/platform/tenants/new"
                          className="mt-3 inline-flex rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          {t("createFirst")}
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span aria-live="polite">
              {t("count", { count: total })} · {t("pageOf", { page: page + 1, pages })}
              {isFetching && <span className="ml-2 opacity-60">…</span>}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0 || isFetching}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                <ChevronLeft size={14} aria-hidden />
                {t("previous")}
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                disabled={page >= pages - 1 || isFetching}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 font-medium text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                {t("next")}
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
