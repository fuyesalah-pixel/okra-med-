import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@okra-med/db";
import { platformUsers } from "@okra-med/db";
import { argon2id, hash, verify } from "argon2";

const db = createDb(process.env.DATABASE_URL!);

export const platformAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: { user: platformUsers } }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      verify: ({ hash: digest, password }) => verify(digest, password),
    },
  },
  session: { cookieName: "okra-platform-session", expiresIn: 60 * 60 * 24 * 7 },
  basePath: "/api/platform-auth",
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  advanced: { cookiePrefix: "okra" },
});
