import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateModuleSchema } from "@/lib/platform/schemas";
import { updateModule } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = updateModuleSchema.parse(await readJson(req));
  const module = await updateModule(params.id, input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: module });
});
