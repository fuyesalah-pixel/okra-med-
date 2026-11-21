import { requestMeta, wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole } from "@/lib/platform/auth";
import { dashboard } from "@/lib/platform/service";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = wrapRoute(async (req, { requestId }) => {
  const actor = await requirePlatformRole(READ_ROLES);
  const data = await dashboard();

  // Viewing the book of business is itself an access to every tenant's numbers.
  await audit(
    {
      actorId: actor.actorId,
      action: "dashboard.view",
      entityType: "platform_dashboard",
      correlationId: requestId,
      ...requestMeta(req),
    },
  );

  return Response.json({ data });
});
