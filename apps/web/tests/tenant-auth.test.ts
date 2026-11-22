import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createDb, tenantAccounts, tenantUsers, tenants } from "@okra-med/db";
import { hash } from "argon2";

/**
 * Real Better Auth sign-in against the database plus the tenant access policy.
 *
 * Nothing is mocked below the HTTP layer: sign-in writes a tenant_sessions row
 * through the production adapter, and the access decision reads the real
 * membership. Break-it target: remove the slug comparison in
 * `decideTenantAccess` and the cross-tenant test goes red while login stays green.
 */

const REDIRECT = "NEXT_REDIRECT";
const NOT_FOUND = "NEXT_NOT_FOUND";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`${REDIRECT}:${url}`);
  },
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);
const PASSWORD = "TenantTestPass123!";

let tenantA = "";
let tenantB = "";
let userA = "";
let userB = "";
let emailA = "";
let emailB = "";
let tenantAuth: typeof import("@/lib/auth/auth.tenant").tenantAuth;
let decideTenantAccess: typeof import("@/lib/auth/session").decideTenantAccess;
let requireTenantSession: typeof import("@/lib/auth/session").requireTenantSession;

const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function createTenantUser(slug: string, email: string) {
  const [tenant] = await db.insert(tenants).values({ slug, name: slug, status: "trial" }).returning({
    id: tenants.id,
  });
  const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const [user] = await db
    .insert(tenantUsers)
    .values({
      tenantId: tenant!.id,
      email,
      passwordHash,
      name: `Admin ${slug}`,
      isActive: true,
    })
    .returning({ id: tenantUsers.id });
  await db.insert(tenantAccounts).values({
    id: `acct-${run}-${slug}`,
    accountId: user!.id,
    providerId: "credential",
    userId: user!.id,
    password: passwordHash,
  });
  return { tenantId: tenant!.id, userId: user!.id };
}

beforeAll(async () => {
  emailA = `tenant-a-${run}@okramed.local`;
  emailB = `tenant-b-${run}@okramed.local`;
  const a = await createTenantUser(`tenant-a-${run}`, emailA);
  const b = await createTenantUser(`tenant-b-${run}`, emailB);
  tenantA = a.tenantId;
  userA = a.userId;
  tenantB = b.tenantId;
  userB = b.userId;

  tenantAuth = (await import("@/lib/auth/auth.tenant")).tenantAuth;
  ({ decideTenantAccess, requireTenantSession } = await import("@/lib/auth/session"));
});

afterAll(async () => {
  // tenant_users does not cascade from tenants; sessions/accounts cascade from users.
  await db.delete(tenantUsers).where(inArray(tenantUsers.tenantId, [tenantA, tenantB]));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.$client.end();
});

describe("tenant auth", () => {
  it("signs a tenant admin in and sets a session cookie", async () => {
    const res = await tenantAuth.api.signInEmail({
      body: { email: emailA, password: PASSWORD },
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const cookie = cookieHeader(res);
    expect(cookie, "sign-in must set the tenant session cookie").toContain("okra-tenant-session");

    const session = await tenantAuth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(userA);
  });

  it("rejects a wrong password with 401 and a generic message", async () => {
    const res = await tenantAuth.api.signInEmail({
      body: { email: emailA, password: "definitely-wrong" },
      asResponse: true,
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as { message?: string };
    const message = String(body.message ?? "");
    expect(message).toMatch(/invalid/i);
    expect(message).not.toMatch(/not found|no user|unknown email/i);
  });

  it("does not accept the legacy tenant_users.password_hash as a credential", async () => {
    // The adapter must read tenant_accounts, not the legacy column; otherwise
    // deleting a user's account row would silently leave a working password.
    await db.delete(tenantAccounts).where(eq(tenantAccounts.userId, userB));
    const res = await tenantAuth.api.signInEmail({
      body: { email: emailB, password: PASSWORD },
      asResponse: true,
    });
    expect(res.status).toBe(401);

    const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await db.insert(tenantAccounts).values({
      id: `acct-${run}-restored`,
      accountId: userB,
      providerId: "credential",
      userId: userB,
      password: passwordHash,
    });
  });

  it("allows a tenant admin into their own tenant only", async () => {
    const { loadTenantMembership } = await import("@/lib/auth/auth.tenant");
    const membershipA = await loadTenantMembership(userA);
    const membershipB = await loadTenantMembership(userB);

    expect(membershipA?.tenantSlug).toBe(`tenant-a-${run}`);
    expect(decideTenantAccess(`tenant-a-${run}`, membershipA)).toBe("ok");
    expect(decideTenantAccess(`tenant-b-${run}`, membershipA)).toBe("not-found");
    expect(decideTenantAccess(`tenant-a-${run}`, membershipB)).toBe("not-found");
  });

  it("denies inactive users and suspended/archived tenants", async () => {
    const base = {
      tenantSlug: `tenant-a-${run}`,
      isActive: true,
      tenantStatus: "trial",
    } as const;
    expect(decideTenantAccess(`tenant-a-${run}`, { ...base, isActive: false })).toBe("not-found");
    expect(decideTenantAccess(`tenant-a-${run}`, { ...base, tenantStatus: "suspended" })).toBe(
      "not-found",
    );
    expect(decideTenantAccess(`tenant-a-${run}`, { ...base, tenantStatus: "archived" })).toBe(
      "not-found",
    );
  });

  it("redirects an unauthenticated visitor to that tenant's login", async () => {
    await expect(requireTenantSession(`tenant-a-${run}`)).rejects.toThrow(
      `${REDIRECT}:/tenant-a-${run}/login`,
    );
  });
});
