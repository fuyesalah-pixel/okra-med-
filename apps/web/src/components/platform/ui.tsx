"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

/** Small, dependency-free primitives shared by the platform admin pages. */

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90",
  secondary:
    "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  danger: "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90",
  ghost: "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        BUTTON_STYLES[variant],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg outline-none",
          wide ? "max-w-2xl" : "max-w-lg",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--card-foreground)]">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded p-1 text-[var(--muted-foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--foreground)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--destructive)]">*</span>}
      </span>
      {children}
      {hint && !error && <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-[var(--destructive)]">
          {error}
        </span>
      )}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        "rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm",
        "text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:opacity-60",
        className,
      ].join(" ")}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={[
        "rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm",
        "text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      ].join(" ")}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        "rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm",
        "text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      ].join(" ")}
    />
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  success: "bg-[var(--success-surface)] text-[var(--success-surface-foreground)]",
  warning: "bg-[var(--warning-surface)] text-[var(--warning-surface-foreground)]",
  danger: "bg-[var(--destructive-surface)] text-[var(--destructive-surface-foreground)]",
  info: "bg-[var(--info-surface)] text-[var(--info-surface-foreground)]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-surface)] p-4 text-sm text-[var(--destructive-surface-foreground)]"
    >
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <Icon size={28} aria-hidden className="mx-auto text-[var(--muted-foreground)]" />
      <p className="mt-2 text-sm font-medium text-[var(--foreground)]">{title}</p>
      {hint && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={`skeleton-${row}`} className="border-b border-[var(--border)] last:border-0">
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-[var(--muted)]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
  countLabel,
  pageLabel,
  previous,
  next,
  busy = false,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  countLabel: string;
  pageLabel: string;
  previous: string;
  next: string;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
      <span aria-live="polite">
        {countLabel} · {pageLabel}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0 || busy}
        >
          {previous}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onPage(Math.min(pages - 1, page + 1))}
          disabled={page >= pages - 1 || busy}
        >
          {next}
        </Button>
        <span className="sr-only">{total}</span>
      </div>
    </div>
  );
}

/** Minor units (santim/cents) rendered with two decimals, e.g. 50000 -> 500.00 ETB. */
export function formatMinor(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)} ${currency}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
