import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDb,
  platformAuditLog,
  platformUsers,
  tenantAuditLog,
  tenantUsers,
  tenants,
} from "@okra-med/db";

/**
 * Role guard, tested through the real route handlers.
 *
 * The session is mocked (better-auth + next/headers are not available outside a
 * request); everything below that — role resolution, the DB lookup, the route
 * body — is the production code path. Break-it target: weaken
 * `requirePlatformRole` to ignore the role and at least two of these go red.
 */
const state: { userId: string | null } = { userId: null };

vi.mock("@/lib/auth/session", () => ({
  getPlatformSession: async () =>
    state.userId ? { user: { id: state.userId, email: "mocked@okramed.local" } } : null,
  getTenantSession: async () => null,
}));

import { POST as createTenantRoute } from "@/app/api/platform/tenants/route";
import { GET as listTenantsRoute } from "@/app/api/platform/tenants/route";
import { POST as suspendRoute } from "@/app/api/platform/tenants/[id]/suspend/route";
import { POST as archiveRoute } from "@/app/api/platform/tenants/[id]/archive/route";

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);
const SLUG = `auth-test-${run}`;

let supportId = "";
let superId = "";
let tenantId = "";

async function upsertUser(email: string, role: "super_admin" | "platform_support") {
  const [row] = await db
    .insert(platformUsers)
    .values({ email, passwordHash: "not-a-real-hash", name: role, role, isActive: true })
    .onConflictDoUpdate({ target: platformUsers.email, set: { role, isActive: true } })
    .returning({ id: platformUsers.id });
  return row!.id;
}

function req(method: string, url: string, body?: unknown) {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Route handlers take `(_req, { params })` where params is a promise (Next 15). */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  supportId = await upsertUser(`support-${run}@okramed.local`, "platform_support");
  superId = await upsertUser(`super-${run}@okramed.local`, "super_admin");

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: SLUG, name: "Auth Test Clinic", status: "trial" })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
});

afterAll(async () => {
  // Audit rows first (they FK to both the tenant and the platform actor), then the
  // fixtures. Audit rows deliberately do not cascade from tenants.
  await db.delete(platformAuditLog).where(sql`${platformAuditLog.actorId} in (${supportId}, ${superId})`);
  const created = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(sql`${tenants.slug} like ${`${SLUG}%`}`);
  for (const { id } of created) {
    await db.delete(tenantAuditLog).where(eq(tenantAuditLog.tenantId, id));
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, id));
    await db.delete(tenants).where(eq(tenants.id, id));
  }
  await db.delete(platformUsers).where(sql`${platformUsers.email} like ${`%-${run}@okramed.local`}`);
  await db.$client.end();
});

describe("requirePlatformRole via route handlers", () => {
  it("lets a platform_support user read the tenant list", async () => {
    state.userId = supportId;
    const res = await listTenantsRoute(req("GET", "/api/platform/tenants"), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("refuses tenant creation by platform_support with 403", async () => {
    state.userId = supportId;
    const res = await createTenantRoute(
      req("POST", "/api/platform/tenants", { slug: `${SLUG}-support`, name: "Support Made This" }),
      undefined,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");

    const [row] = await db.select().from(tenants).where(eq(tenants.slug, `${SLUG}-support`));
    expect(row).toBeUndefined();
  });

  it("refuses tenant suspension by platform_support with 403", async () => {
    state.userId = supportId;
    const res = await suspendRoute(
      req("POST", `/api/platform/tenants/${tenantId}/suspend`, { reason: "support attempt" }),
      ctx(tenantId),
    );
    expect(res.status).toBe(403);

    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(row?.status).toBe("trial");
  });

  it("refuses tenant archive by platform_support with 403", async () => {
    state.userId = supportId;
    const res = await archiveRoute(req("POST", `/api/platform/tenants/${tenantId}/archive`), ctx(tenantId));
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    state.userId = null;
    const res = await listTenantsRoute(req("GET", "/api/platform/tenants"), undefined);
    expect(res.status).toBe(401);
  });

  it("lets a super_admin create and suspend tenants", async () => {
    state.userId = superId;
    const created = await createTenantRoute(
      req("POST", "/api/platform/tenants", {
        slug: `${SLUG}-super`,
        name: "Super Made This",
        trialDays: 0,
      }),
      undefined,
    );
    expect(created.status).toBe(201);
    const body = await created.json();

    const suspended = await suspendRoute(
      req("POST", `/api/platform/tenants/${body.data.id}/suspend`, { reason: "test" }),
      ctx(body.data.id),
    );
    expect(suspended.status).toBe(200);
    expect((await suspended.json()).data.status).toBe("suspended");
  });
});
