import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { platformAuth } from "./auth.platform";
import { loadTenantMembership, tenantAuth } from "./auth.tenant";

export async function getPlatformSession() {
  return platformAuth.api.getSession({ headers: await headers() });
}
export async function getTenantSession() {
  return tenantAuth.api.getSession({ headers: await headers() });
}
export async function requirePlatformSession() {
  const s = await getPlatformSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

export type TenantMembership = NonNullable<Awaited<ReturnType<typeof loadTenantMembership>>>;

/**
 * Pure access decision so cross-tenant rejection can be tested without Next's
 * request context. A session is valid only for the tenant it belongs to.
 */
export function decideTenantAccess(
  slug: string,
  membership: Pick<TenantMembership, "tenantSlug" | "isActive" | "tenantStatus"> | null,
): "ok" | "unauthenticated" | "not-found" {
  if (!membership) return "unauthenticated";
  if (!membership.isActive) return "not-found";
  if (membership.tenantStatus === "suspended" || membership.tenantStatus === "archived") {
    return "not-found";
  }
  if (membership.tenantSlug !== slug) return "not-found";
  return "ok";
}

/**
 * Guard every tenant page. Unauthenticated visitors go to that tenant's login;
 * a signed-in user from another tenant gets a 404, never the other tenant's data.
 */
export async function requireTenantSession(slug: string) {
  const session = await getTenantSession();
  if (!session) redirect(`/${slug}/login`);

  const membership = await loadTenantMembership(session.user.id);
  const access = decideTenantAccess(slug, membership);
  if (access === "unauthenticated") redirect(`/${slug}/login`);
  if (access === "not-found") notFound();

  return { session, membership: membership! };
}
