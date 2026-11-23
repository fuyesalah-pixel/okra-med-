import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, platformAuditLog, platformUsers } from "@okra-med/db";

/**
 * Break-it target: remove `SUPER_ADMIN_ROLES` from /api/platform/users and the
 * platform_support case below returns 200 instead of 403. The page itself also
 * redirects on 403, but the API is the boundary under test.
 */

const state: { userId: string | null } = { userId: null };

vi.mock("@/lib/auth/session", () => ({
  getPlatformSession: async () =>
    state.userId ? { user: { id: state.userId, email: "users-page@okramed.local" } } : null,
  getTenantSession: async () => null,
}));

import { GET as usersRoute } from "@/app/api/platform/users/route";
import { PATCH as patchUserRoute } from "@/app/api/platform/users/[id]/route";

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);

let supportId = "";
let superId = "";

async function upsert(email: string, role: "super_admin" | "platform_support", name: string) {
  const [row] = await db
    .insert(platformUsers)
    .values({ email, passwordHash: "", name, role, isActive: true })
    .onConflictDoUpdate({ target: platformUsers.email, set: { role, isActive: true } })
    .returning({ id: platformUsers.id });
  return row!.id;
}

beforeAll(async () => {
  supportId = await upsert(`support-users-${run}@okramed.local`, "platform_support", "Support Page");
  superId = await upsert(`super-users-${run}@okramed.local`, "super_admin", "Super Page");
});

afterAll(async () => {
  await db.delete(platformAuditLog).where(sql`${platformAuditLog.actorId} in (${supportId}, ${superId})`);
  await db.delete(platformUsers).where(sql`${platformUsers.email} like ${`%-users-${run}@okramed.local`}`);
  await db.$client.end();
});

const noParams = { params: Promise.resolve({}) };

describe("platform users route guard", () => {
  it("refuses platform_support with 403", async () => {
    state.userId = supportId;
    const res = await usersRoute(
      new Request("http://localhost:3000/api/platform/users"),
      noParams,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("lets a super_admin list users", async () => {
    state.userId = superId;
    const res = await usersRoute(
      new Request("http://localhost:3000/api/platform/users"),
      noParams,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const emails = body.data.map((row: { email: string }) => row.email);
    expect(emails).toContain(`support-users-${run}@okramed.local`);
    expect(emails).toContain(`super-users-${run}@okramed.local`);
  });

  it("refuses a self-demotion", async () => {
    state.userId = superId;
    const res = await patchUserRoute(
      new Request(`http://localhost:3000/api/platform/users/${superId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "platform_support" }),
      }),
      { params: Promise.resolve({ id: superId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CANNOT_CHANGE_OWN_ROLE");

    const [row] = await db.select().from(platformUsers).where(eq(platformUsers.id, superId));
    expect(row?.role).toBe("super_admin");
  });
});
