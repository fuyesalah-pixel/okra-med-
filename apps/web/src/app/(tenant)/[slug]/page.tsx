import { getTenantSession } from "@/lib/auth/session";
export default async function TenantDashboard() {
  const session = await getTenantSession();
  return <div className="p-8"><h1 className="text-2xl font-bold">Tenant Dashboard</h1><p>Hello, {session?.user?.name ?? "Guest"}</p></div>;
}
