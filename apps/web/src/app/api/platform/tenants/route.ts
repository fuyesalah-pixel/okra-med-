import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, TENANT_ADMIN_ROLES } from "@/lib/platform/auth";
import { createTenantSchema, listTenantsQuerySchema } from "@/lib/platform/schemas";
import { createTenant, listTenants } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async (req) => {
  await requirePlatformRole(READ_ROLES);
  const query = listTenantsQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  );
  return Response.json({ data: await listTenants(query) });
});

export const POST = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(TENANT_ADMIN_ROLES);
  const input = createTenantSchema.parse(await readJson(req));
  const tenant = await createTenant(input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: tenant }, { status: 201 });
});
