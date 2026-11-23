import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDb,
  platformAuditLog,
  platformNotifications,
  platformUsers,
  tenants,
} from "@okra-med/db";

/**
 * Break-it target: hardcode the audience (or ignore the posted ids) and this
 * goes red — the stored row must contain exactly the two selected tenants, and
 * the list must resolve them to those tenants' names.
 */

const state: { userId: string | null } = { userId: null };

vi.mock("@/lib/auth/session", () => ({
  getPlatformSession: async () =>
    state.userId ? { user: { id: state.userId, email: "notify-page@okramed.local" } } : null,
  getTenantSession: async () => null,
}));

import { GET as listRoute, POST as createRoute } from "@/app/api/platform/notifications/route";

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);

let actorId = "";
let tenantA = "";
let tenantB = "";
let tenantC = "";

beforeAll(async () => {
  const [user] = await db
    .insert(platformUsers)
    .values({
      email: `notify-page-${run}@okramed.local`,
      passwordHash: "",
      name: "Notify Page Actor",
      role: "super_admin",
    })
    .returning({ id: platformUsers.id });
  actorId = user!.id;

  const created = await db
    .insert(tenants)
    .values([
      { slug: `notify-a-${run}`, name: "Notify Clinic A", status: "trial" },
      { slug: `notify-b-${run}`, name: "Notify Clinic B", status: "trial" },
      { slug: `notify-c-${run}`, name: "Notify Clinic C", status: "trial" },
    ])
    .returning({ id: tenants.id, slug: tenants.slug });

  tenantA = created.find((row) => row.slug === `notify-a-${run}`)!.id;
  tenantB = created.find((row) => row.slug === `notify-b-${run}`)!.id;
  tenantC = created.find((row) => row.slug === `notify-c-${run}`)!.id;
});

afterAll(async () => {
  const rows = await db
    .select({ id: platformNotifications.id })
    .from(platformNotifications)
    .where(eq(platformNotifications.createdBy, actorId));
  for (const row of rows) {
    await db.delete(platformAuditLog).where(eq(platformAuditLog.entityId, row.id));
  }
  await db.delete(platformNotifications).where(eq(platformNotifications.createdBy, actorId));
  await db.delete(tenants).where(sql`${tenants.slug} like ${`notify-%-${run}`}`);
  await db.delete(platformUsers).where(eq(platformUsers.id, actorId));
  await db.$client.end();
});

const noParams = { params: Promise.resolve({}) };

describe("notification audience", () => {
  it("stores and resolves exactly the selected tenants", async () => {
    state.userId = actorId;

    const res = await createRoute(
      new Request("http://localhost:3000/api/platform/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Audience test ${run}`,
          body: "Only two clinics should see this.",
          severity: "warning",
          audience: [tenantA, tenantB],
        }),
      }),
      noParams,
    );
    expect(res.status).toBe(201);
    const created = (await res.json()).data;

    const [stored] = await db
      .select()
      .from(platformNotifications)
      .where(eq(platformNotifications.id, created.id));
    expect([...stored!.audience].sort()).toEqual([tenantA, tenantB].sort());
    expect(stored!.audience).not.toContain(tenantC);

    const list = await listRoute(
      new Request("http://localhost:3000/api/platform/notifications"),
      noParams,
    );
    const body = await list.json();
    const row = body.data.find((item: { id: string }) => item.id === created.id);
    expect(row.allTenants).toBe(false);
    expect(row.recipients.map((tenant: { id: string }) => tenant.id).sort()).toEqual(
      [tenantA, tenantB].sort(),
    );
    expect(row.recipients.map((tenant: { name: string }) => tenant.name).sort()).toEqual([
      "Notify Clinic A",
      "Notify Clinic B",
    ]);
    expect(row.audience).not.toContain(tenantC);
  });

  it("rejects an unknown tenant id", async () => {
    state.userId = actorId;
    const res = await createRoute(
      new Request("http://localhost:3000/api/platform/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Unknown audience",
          body: "This should not publish.",
          severity: "info",
          audience: ["00000000-0000-0000-0000-000000000000"],
        }),
      }),
      noParams,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("UNKNOWN_TENANT");
  });
});
