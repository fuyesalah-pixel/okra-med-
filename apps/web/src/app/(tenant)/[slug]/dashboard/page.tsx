import { requireTenantSession } from "@/lib/auth/session";

export default async function TenantDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { membership } = await requireTenantSession(slug);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">{membership.tenantName}</h1>
      <p>Tenant Dashboard</p>
      <p>Hello, {membership.name}</p>
    </div>
  );
}
