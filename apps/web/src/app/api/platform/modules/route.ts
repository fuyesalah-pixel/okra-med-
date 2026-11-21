import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { createModuleSchema } from "@/lib/platform/schemas";
import { createModule, listModules } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async () => {
  await requirePlatformRole(READ_ROLES);
  return Response.json({ data: await listModules() });
});

export const POST = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = createModuleSchema.parse(await readJson(req));
  const created = await createModule(input, actor, { requestId, ...requestMeta(req) });
  return Response.json({ data: created }, { status: 201 });
});
