import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, TENANT_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateTenantSchema } from "@/lib/platform/schemas";
import { getTenant, updateTenant } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute<{ id: string }>(async (req, { params }) => {
  await requirePlatformRole(READ_ROLES);
  return Response.json({ data: await getTenant(params.id) });
});

export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(TENANT_ADMIN_ROLES);
  const input = updateTenantSchema.parse(await readJson(req));
  const tenant = await updateTenant(params.id, input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: tenant });
});
