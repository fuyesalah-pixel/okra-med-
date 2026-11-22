import { wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole } from "@/lib/platform/auth";
import { tenantAuditQuerySchema } from "@/lib/platform/schemas";
import { getTenant, listTenantAudit } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export const GET = wrapRoute<{ id: string }>(async (req, { params }) => {
  await requirePlatformRole(READ_ROLES);
  const url = new URL(req.url);
  const query = tenantAuditQuerySchema.parse(
    Object.fromEntries(url.searchParams.entries()),
  );

  const result = await listTenantAudit(params.id, query);

  if (query.format === "csv") {
    const { tenant } = await getTenant(params.id);
    const header = ["timestamp", "actor", "actorEmail", "action", "entity", "entityId", "requestId"];
    const lines = [header.join(",")];
    for (const row of result.items) {
      lines.push(
        [
          csvCell(row.createdAt.toISOString()),
          csvCell(row.actor),
          csvCell(row.actorEmail),
          csvCell(row.action),
          csvCell(row.entityType),
          csvCell(row.entityId),
          csvCell(row.requestId),
        ].join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tenant-${tenant.slug}-audit.csv"`,
      },
    });
  }

  return Response.json({ data: result });
});
