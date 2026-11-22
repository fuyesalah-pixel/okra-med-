"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  Bell,
  Building2,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ScrollText,
  Settings,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

type NavKey =
  | "dashboard"
  | "tenants"
  | "modules"
  | "pricing"
  | "settings"
  | "audit"
  | "users"
  | "notifications";

const NAV_ITEMS: { href: Route; icon: LucideIcon; key: NavKey }[] = [
  { href: "/platform/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/platform/tenants", icon: Building2, key: "tenants" },
  { href: "/platform/modules", icon: Package, key: "modules" },
  { href: "/platform/pricing", icon: DollarSign, key: "pricing" },
  { href: "/platform/settings", icon: Settings, key: "settings" },
  { href: "/platform/audit", icon: ScrollText, key: "audit" },
  { href: "/platform/users", icon: Users, key: "users" },
  { href: "/platform/notifications", icon: Bell, key: "notifications" },
];

export interface PlatformUser {
  name: string;
  email: string;
  role: string;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/platform/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: Route;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-foreground)]"
          : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)]",
      ].join(" ")}
    >
      <Icon size={18} aria-hidden />
      {label}
      {active && <ChevronRight size={14} className="ml-auto opacity-60" aria-hidden />}
    </Link>
  );
}

function SidebarContent({
  pathname,
  user,
  onNavigate,
  onSignOut,
}: {
  pathname: string;
  user: PlatformUser;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations("platform.nav");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-[var(--sidebar-border)] px-6">
        <Link
          href="/platform/dashboard"
          className="flex items-center gap-2 rounded text-[var(--sidebar-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          onClick={onNavigate}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--accent-foreground)]">
            O
          </div>
          <span className="text-sm font-semibold tracking-tight">{t("brand")}</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t("primaryNavigation")}>
        <ul className="space-y-1" role="list">
          {NAV_ITEMS.map(({ href, icon, key }) => (
            <li key={href}>
              <NavItem
                href={href}
                icon={icon}
                label={t(key)}
                active={isActive(pathname, href)}
                onClick={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-[var(--sidebar-border)] px-3 py-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-active)] text-xs font-bold text-[var(--sidebar-foreground)]"
            aria-hidden
          >
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--sidebar-foreground)]">{user.name}</p>
            <p className="truncate text-xs text-[var(--sidebar-muted)]">
              {user.role === "super_admin" ? t("roleSuperAdmin") : t("rolePlatformSupport")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--sidebar-muted)] transition-colors hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <LogOut size={18} aria-hidden />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}

export function PlatformShell({ user, children }: { user: PlatformUser; children: React.ReactNode }) {
  const t = useTranslations("platform.nav");
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const pageKey = NAV_ITEMS.find((item) => isActive(pathname, item.href))?.key ?? "dashboard";
  const isDark = mounted && resolvedTheme === "dark";

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/platform-auth/sign-out", { method: "POST" });
    } finally {
      window.location.href = "/platform/login";
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <a href="#main-content" className="skip-to-content">
        {t("skipToContent")}
      </a>

      <aside
        className="hidden w-64 flex-shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] lg:flex"
        aria-label={t("sidebar")}
      >
        <SidebarContent pathname={pathname} user={user} onSignOut={signOut} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("navigationMenu")}
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-transform duration-200 lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label={t("closeNavigation")}
          className="absolute right-3 top-3 rounded p-1 text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X size={20} aria-hidden />
        </button>
        <SidebarContent
          pathname={pathname}
          user={user}
          onNavigate={() => setDrawerOpen(false)}
          onSignOut={signOut}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("openNavigation")}
            className="rounded p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>

          <h1 className="truncate text-sm font-semibold text-[var(--foreground)]">{t(pageKey)}</h1>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={t("toggleTheme")}
              className="rounded p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>

            <Link
              href="/platform/notifications"
              aria-label={t("notifications")}
              className="rounded p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Bell size={18} aria-hidden />
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t("userMenu")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {user.name.trim().charAt(0).toUpperCase() || "?"}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-11 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] shadow-lg"
                >
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <p className="truncate text-sm font-medium text-[var(--popover-foreground)]">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">{user.email}</p>
                    <span className="mt-2 inline-flex rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                      {user.role === "super_admin" ? t("roleSuperAdmin") : t("rolePlatformSupport")}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={signOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] disabled:opacity-60"
                  >
                    <LogOut size={16} aria-hidden />
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
