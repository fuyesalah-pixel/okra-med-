"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { TenantStatus } from "./tenant-types";

const STATUS_STYLES: Record<TenantStatus, string> = {
  trial: "bg-[var(--warning-surface)] text-[var(--warning-surface-foreground)]",
  active: "bg-[var(--success-surface)] text-[var(--success-surface-foreground)]",
  suspended: "bg-[var(--destructive-surface)] text-[var(--destructive-surface-foreground)]",
  archived: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  const t = useTranslations("platform.tenants.status");
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {t(status)}
    </span>
  );
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

export function formatMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US").format(value)} ${currency}`;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("common");
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-title" className="text-base font-semibold text-[var(--card-foreground)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("cancel")}
            className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {description && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
              destructive ? "bg-[var(--destructive)]" : "bg-[var(--accent)]",
            ].join(" ")}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--foreground)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--destructive)]">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
      />
      {error && <span className="text-xs text-[var(--destructive)]">{error}</span>}
    </label>
  );
}
