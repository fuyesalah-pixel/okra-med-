import { KpiCardSkeleton } from "./kpi-card";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="h-4 w-32 rounded bg-[var(--muted)]" />
              <div className="h-3 w-16 rounded bg-[var(--muted)]" />
            </div>
            <div className="divide-y divide-[var(--border)]">
              {Array.from({ length: 4 }).map((_, row) => (
                <div key={row} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-4 w-28 rounded bg-[var(--muted)]" />
                    <div className="h-3 w-16 rounded bg-[var(--muted)]" />
                  </div>
                  <div className="h-5 w-12 rounded-full bg-[var(--muted)]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="h-4 w-36 rounded bg-[var(--muted)]" />
        </div>
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-4 w-48 rounded bg-[var(--muted)]" />
                <div className="h-3 w-24 rounded bg-[var(--muted)]" />
              </div>
              <div className="h-3 w-24 rounded bg-[var(--muted)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
