"use client";

import { useTranslations } from "next-intl";

type Section = "tenants" | "modules" | "pricing" | "settings" | "audit" | "users" | "notifications";

export function ComingSoon({ section }: { section: Section }) {
  const nav = useTranslations("platform.nav");
  const t = useTranslations("platform.header");

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{nav(section)}</h2>
      <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--card-foreground)]">{t("comingSoon")}</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t("comingSoonHint")}</p>
      </div>
    </div>
  );
}
