import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { createNotificationSchema } from "@/lib/platform/schemas";
import {
  createPlatformNotification,
  listPlatformNotifications,
} from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async () => {
  await requirePlatformRole(READ_ROLES);
  return Response.json({ data: await listPlatformNotifications() });
});

export const POST = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = createNotificationSchema.parse(await readJson(req));
  const created = await createPlatformNotification(input, actor, {
    requestId,
    ...requestMeta(req),
  });
  return Response.json({ data: created }, { status: 201 });
});
