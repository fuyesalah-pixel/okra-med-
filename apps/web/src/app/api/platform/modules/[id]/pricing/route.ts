import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { pricingSchema } from "@/lib/platform/schemas";
import { setModulePricing } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

/**
 * PUT, not PATCH: the previous active price is retired and a new row inserted, so
 * this replaces the module's live price. Existing subscriptions keep the unit
 * price they were sold at.
 */
export const PUT = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = pricingSchema.parse(await readJson(req));
  const pricing = await setModulePricing(params.id, input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: pricing });
});
