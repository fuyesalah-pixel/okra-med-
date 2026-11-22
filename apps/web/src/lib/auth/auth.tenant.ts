import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@okra-med/db";
import {
  tenantAccounts,
  tenantSessions,
  tenantUsers,
  tenantVerifications,
  tenants,
} from "@okra-med/db";
import { eq } from "drizzle-orm";
import { argon2id, hash, verify } from "argon2";

// Credentials are resolved before a tenant context exists, and `tenant_users` is
// RLS-forced. The owner connection bypasses RLS; the app connection (`okra_app`)
// would see zero rows and every login would fail. Tenant isolation lives in
// `requireTenantSession`, which resolves the user's tenant and compares it with
// the slug in the URL.
const dbUrl = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL!;
const db = createDb(dbUrl);

export const tenantAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: tenantUsers,
      session: tenantSessions,
      account: tenantAccounts,
      verification: tenantVerifications,
    },
  }),
  user: {
    // tenant_id is NOT NULL, and Better Auth refuses to start when a required
    // user column is one it "never writes". Declaring it makes it part of the
    // model; sign-up is disabled, so it is only ever written by provisioning.
    additionalFields: {
      tenantId: { type: "string", required: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Tenant users are created by provisioning / the platform UI, never by
    // self-service sign-up.
    disableSignUp: true,
    password: {
      hash: (password) => hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      verify: ({ hash: digest, password }) => verify(digest, password),
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7 },
  basePath: "/api/tenant-auth",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  // Better Auth 1.7 names cookies via advanced.cookies, not session.cookieName.
  // Distinct names keep a tenant login from overwriting a platform login.
  advanced: {
    cookiePrefix: "okra",
    cookies: { session_token: { name: "okra-tenant-session" } },
  },
});

/**
 * Resolve the tenant a session user belongs to. Uses the owner connection
 * because the session is read before any tenant context exists.
 */
export async function loadTenantMembership(userId: string) {
  const [row] = await db
    .select({
      userId: tenantUsers.id,
      tenantId: tenantUsers.tenantId,
      email: tenantUsers.email,
      name: tenantUsers.name,
      isActive: tenantUsers.isActive,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
    })
    .from(tenantUsers)
    .innerJoin(tenants, eq(tenants.id, tenantUsers.tenantId))
    .where(eq(tenantUsers.id, userId))
    .limit(1);
  return row ?? null;
}
