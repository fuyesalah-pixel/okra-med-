import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateSubscriptionModulesSchema } from "@/lib/platform/schemas";
import { replaceSubscriptionModules } from "@/lib/subscription/engine";

export const dynamic = "force-dynamic";

export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = updateSubscriptionModulesSchema.parse(await readJson(req));
  const subscription = await replaceSubscriptionModules(params.id, input.modules, actor, {
    requestId,
    ...requestMeta(req),
  });
  return Response.json({ data: subscription });
});
