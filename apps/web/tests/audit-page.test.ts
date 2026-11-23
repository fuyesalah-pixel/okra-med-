import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, platformAuditLog, platformUsers } from "@okra-med/db";

/**
 * Break-it target: hardcode a filtered count in the audit page (or drop the
 * action filter) and this goes red — the API's total is compared with a direct
 * COUNT against the same rows.
 */

const state: { userId: string | null } = { userId: null };

vi.mock("@/lib/auth/session", () => ({
  getPlatformSession: async () =>
    state.userId ? { user: { id: state.userId, email: "audit-page@okramed.local" } } : null,
  getTenantSession: async () => null,
}));

import { GET as auditRoute } from "@/app/api/platform/audit/route";

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);
const ACTION = `page-test-${run}`;
const OTHER_ACTION = `page-test-${run}-other`;

let actorId = "";

beforeAll(async () => {
  const [user] = await db
    .insert(platformUsers)
    .values({
      email: `audit-page-${run}@okramed.local`,
      passwordHash: "",
      name: "Audit Page Actor",
      role: "super_admin",
    })
    .returning({ id: platformUsers.id });
  actorId = user!.id;

  await db.insert(platformAuditLog).values([
    { actorId, action: ACTION, entityType: "module", entityId: run, after: { fields: ["name"] } },
    { actorId, action: ACTION, entityType: "module", entityId: `${run}-2`, before: { fields: ["name"] } },
    { actorId, action: OTHER_ACTION, entityType: "tenant", entityId: run },
  ]);
});

afterAll(async () => {
  await db.delete(platformAuditLog).where(sql`${platformAuditLog.action} like ${`page-test-${run}%`}`);
  await db.delete(platformUsers).where(eq(platformUsers.id, actorId));
  await db.$client.end();
});

describe("platform audit filtering", () => {
  it("returns exactly the rows a direct count finds", async () => {
    state.userId = actorId;

    const [expected] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(platformAuditLog)
      .where(eq(platformAuditLog.action, ACTION));

    const res = await auditRoute(
      new Request(`http://localhost:3000/api/platform/audit?action=${ACTION}`),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.total).toBe(Number(expected!.n));
    expect(body.data.items).toHaveLength(Number(expected!.n));
    expect(
      body.data.items.every((row: { action: string }) => row.action === ACTION),
    ).toBe(true);
    expect(body.data.facets.actions).toContain(ACTION);
  });

  it("filters by request id", async () => {
    state.userId = actorId;
    const correlationId = `req-${run}`;
    await db.insert(platformAuditLog).values({
      actorId,
      action: ACTION,
      entityType: "module",
      entityId: run,
      correlationId,
    });

    const res = await auditRoute(
      new Request(`http://localhost:3000/api/platform/audit?requestId=${correlationId}`),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].requestId).toBe(correlationId);
  });
});
