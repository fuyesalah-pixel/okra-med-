import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateModuleSchema } from "@/lib/platform/schemas";
import { deleteModule, updateModule } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = updateModuleSchema.parse(await readJson(req));
  const updated = await updateModule(params.id, input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: updated });
});

/** Only a module with no subscription line items can be deleted; see deleteModule. */
export const DELETE = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  await deleteModule(params.id, actor, { requestId, ...requestMeta(req) });
  return new Response(null, { status: 204 });
});
