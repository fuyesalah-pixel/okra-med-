import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { listTenantsQuerySchema, provisionTenantSchema } from "@/lib/platform/schemas";
import { listTenants } from "@/lib/platform/service";
import { provisionTenant } from "@/lib/provisioning/provision";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async (req) => {
  await requirePlatformRole(READ_ROLES);
  const query = listTenantsQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  );
  return Response.json({ data: await listTenants(query) });
});

/**
 * Provisioning is now atomic: tenant + settings + subscription + items +
 * Administrator user. A previous POST created only the tenant, leaving a shell
 * that could not log in and had no subscription.
 */
export const POST = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = provisionTenantSchema.parse(await readJson(req));
  const { tenant, subscription, adminUserId, items } = await provisionTenant(input, actor, {
    requestId,
    ...requestMeta(req),
  });
  return Response.json({ data: { tenant, subscription, adminUserId, items } }, { status: 201 });
});
