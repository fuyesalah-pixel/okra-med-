import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { subscriptionPatchSchema } from "@/lib/platform/schemas";
import { cancelSubscription, renewSubscription } from "@/lib/subscription/engine";

export const dynamic = "force-dynamic";

/**
 * Renew or cancel a subscription. One endpoint with an explicit `action` keeps
 * the two mutually exclusive operations auditable under distinct action names
 * (`subscription.renew` / `subscription.cancel`).
 */
export const PATCH = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const { action } = subscriptionPatchSchema.parse(await readJson(req));
  const meta = { requestId, ...requestMeta(req) };

  const subscription =
    action === "renew"
      ? await renewSubscription(params.id, actor, meta)
      : await cancelSubscription(params.id, actor, meta);

  return Response.json({ data: subscription });
});
