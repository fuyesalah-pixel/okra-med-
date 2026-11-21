import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@okra-med/db";
import { tenantUsers } from "@okra-med/db";

const db = createDb(process.env.DATABASE_URL!);

export const tenantAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: { user: tenantUsers } }),
  emailAndPassword: { enabled: true, password: { hashing: { algorithm: "argon2id" } } },
  session: { cookieName: "okra-tenant-session", expiresIn: 60 * 60 * 24 * 7 },
  basePath: "/api/tenant-auth",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  advanced: { cookiePrefix: "okra" },
});
