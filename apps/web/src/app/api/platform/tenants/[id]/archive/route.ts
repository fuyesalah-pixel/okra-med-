import { readOptionalJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { archiveTenantSchema } from "@/lib/platform/schemas";
import { archiveTenant } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

/** Archiving is terminal for the tenant (no transition out), so it is super-admin only. */
export const POST = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const body = archiveTenantSchema.parse(await readOptionalJson(req));
  const tenant = await archiveTenant(params.id, actor, {
    requestId,
    reason: body.reason,
    ...requestMeta(req),
  });
  return Response.json({ data: tenant });
});
