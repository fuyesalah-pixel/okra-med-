import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { createPlatformUserSchema } from "@/lib/platform/schemas";
import { createPlatformUser, listPlatformUsers } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

/**
 * Platform user directory. Read and write are super_admin only: a support
 * account must not be able to enumerate — or create — other admins.
 */
export const GET = wrapRoute(async () => {
  await requirePlatformRole(SUPER_ADMIN_ROLES);
  return Response.json({ data: await listPlatformUsers() });
});

export const POST = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = createPlatformUserSchema.parse(await readJson(req));
  const created = await createPlatformUser(input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: created }, { status: 201 });
});
