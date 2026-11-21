import { headers } from "next/headers";
import { platformAuth } from "./auth.platform";
import { tenantAuth } from "./auth.tenant";

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
export async function requireTenantSession() {
  const s = await getTenantSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}
