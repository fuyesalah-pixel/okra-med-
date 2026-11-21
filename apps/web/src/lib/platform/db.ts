import { createDb, type Db } from "@okra-med/db";
import { AppError } from "@/lib/errors";

let cached: Db | null = null;

/**
 * Connection used by the platform API.
 *
 * Platform dashboards and tenant administration read *across* tenants. RLS is
 * `FORCE`d on every tenant table, so the ordinary application role (`okra_app`)
 * sees zero rows there by design — which is correct for tenant requests and
 * useless for a super-admin dashboard.
 *
 * The platform control plane therefore connects with a role that is allowed to
 * see all tenants (`PLATFORM_DATABASE_URL`), while tenant request paths keep
 * using `DATABASE_URL` plus `withTenantContext`. Pointing both at the same
 * superuser URL (as CI does) is fine for tests but must not be the production
 * shape: the platform role should hold `BYPASSRLS` and nothing else, and it
 * must never be the role a tenant request handler uses.
 */
export function platformDb(): Db {
  if (cached) return cached;
  const url = process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new AppError("CONFIG", "Platform database URL is not configured", 500);
  cached = createDb(url);
  return cached;
}

/** Test-only: drop the memoised connection so a new URL can be picked up. */
export function resetPlatformDbForTests(): void {
  cached = null;
}
