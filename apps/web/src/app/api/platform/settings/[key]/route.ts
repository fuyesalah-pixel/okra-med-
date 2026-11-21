import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { updateSettingSchema } from "@/lib/platform/schemas";
import { updateSetting } from "@/lib/platform/service";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Settings exist by seed/migration; this only updates known keys (404 otherwise). */
export const PATCH = wrapRoute<{ key: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const body = updateSettingSchema.parse(await readJson(req));
  // `z.unknown()` infers as optional (unknown includes undefined), so presence is
  // enforced here: an explicit null clears the value, a missing key is a mistake.
  if (!("value" in body) || body.value === undefined) {
    throw new AppError("VALIDATION", "`value` is required", 422);
  }
  const setting = await updateSetting(
    params.key,
    { value: body.value, description: body.description },
    actor,
    { requestId, ...requestMeta(req) },
  );
  return Response.json({ data: setting });
});
