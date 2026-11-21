import { wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole } from "@/lib/platform/auth";
import { listSettings } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async () => {
  await requirePlatformRole(READ_ROLES);
  return Response.json({ data: await listSettings() });
});
