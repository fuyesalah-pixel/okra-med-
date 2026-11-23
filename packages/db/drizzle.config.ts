import { defineConfig } from "drizzle-kit";
import "dotenv/config";
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Migrations need DDL, which the app roles do not have. Prefer the owner
  // connection when it is configured; CI sets only DATABASE_URL (owner).
  dbCredentials: {
    url: (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)!,
  },
});
