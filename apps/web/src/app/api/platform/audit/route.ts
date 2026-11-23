import { wrapRoute } from "@/lib/http";
import { READ_ROLES, requirePlatformRole } from "@/lib/platform/auth";
import { platformAuditQuerySchema } from "@/lib/platform/schemas";
import { listPlatformAudit } from "@/lib/platform/service";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Full control-plane audit log. The CSV export runs through the same filters as
 * the JSON view (the page builds the href from its current state), so an export
 * cannot contain rows the operator could not see on screen.
 */
export const GET = wrapRoute(async (req) => {
  await requirePlatformRole(READ_ROLES);
  const url = new URL(req.url);
  const input = platformAuditQuerySchema.parse(Object.fromEntries(url.searchParams));

  const result = await listPlatformAudit({
    from: input.from,
    to: input.to,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    requestId: input.requestId,
    limit: input.limit,
    offset: input.offset,
  });

  if (input.format === "csv") {
    const header = [
      "timestamp",
      "actor",
      "actor_email",
      "action",
      "entity_type",
      "entity_id",
      "request_id",
      "before",
      "after",
    ];
    const lines = result.items.map((row) =>
      [
        row.createdAt.toISOString(),
        row.actor,
        row.actorEmail,
        row.action,
        row.entityType,
        row.entityId,
        row.requestId,
        row.before,
        row.after,
      ]
        .map(csvCell)
        .join(","),
    );
    return new Response([header.join(","), ...lines].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="platform-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return Response.json({ data: result });
});
