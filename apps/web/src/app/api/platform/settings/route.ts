import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updatePlatformSettingsSchema } from "@/lib/platform/schemas";
import { listSettings, updateSettings } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async () => {
  await requirePlatformRole(READ_ROLES);
  return Response.json({ data: await listSettings() });
});

/** Batch save: the settings form sends every changed key in one transaction. */
export const PUT = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = updatePlatformSettingsSchema.parse(await readJson(req));
  const updated = await updateSettings(input.values, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: updated });
});
