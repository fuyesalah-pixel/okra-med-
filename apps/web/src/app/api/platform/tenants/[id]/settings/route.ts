import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateTenantSettingsSchema } from "@/lib/platform/schemas";
import { updateTenantSettings } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = updateTenantSettingsSchema.parse(await readJson(req));
  const result = await updateTenantSettings(params.id, input, actor, {
    requestId,
    ...requestMeta(req),
  });
  return Response.json({ data: result });
});
