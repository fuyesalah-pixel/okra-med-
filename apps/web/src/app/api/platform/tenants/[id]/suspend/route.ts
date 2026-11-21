import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { suspendTenantSchema } from "@/lib/platform/schemas";
import { suspendTenant } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const POST = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const { reason } = suspendTenantSchema.parse(await readJson(req));
  const tenant = await suspendTenant(params.id, reason, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: tenant });
});
