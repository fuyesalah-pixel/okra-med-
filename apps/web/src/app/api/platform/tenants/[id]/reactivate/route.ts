import { requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, TENANT_ADMIN_ROLES } from "@/lib/platform/auth";
import { reactivateTenant } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const POST = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(TENANT_ADMIN_ROLES);
  const tenant = await reactivateTenant(params.id, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: tenant });
});
