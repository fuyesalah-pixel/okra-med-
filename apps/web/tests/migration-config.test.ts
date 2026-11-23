import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file: string) => readFileSync(root + file, "utf8");

/**
 * Migrations need DDL. The tenant role (`okra_app`) and the platform role
 * (`okra_platform`, which is the same privileges plus BYPASSRLS) deliberately do
 * not have it, so a migrate service pointed at either one fails on the first
 * schema change — in production, after a deploy. Guard the wiring here instead.
 */
describe("migration connection", () => {
  const compose = read("docker-compose.prod.yml");

  /** The `migrate` service block, up to the next service definition. */
  const migrateBlock = (() => {
    const start = compose.indexOf("\n  migrate:");
    expect(start).toBeGreaterThan(-1);
    const rest = compose.slice(start + 1);
    const end = rest.indexOf("\n  postgres:");
    return end === -1 ? rest : rest.slice(0, end);
  })();

  it("takes its URL from MIGRATION_DATABASE_URL, with a DATABASE_URL fallback", () => {
    expect(migrateBlock).toContain("$${MIGRATION_DATABASE_URL:-$$DATABASE_URL}");
  });

  it("never runs DDL through the BYPASSRLS platform role", () => {
    expect(migrateBlock).not.toContain("PLATFORM_DATABASE_URL");
  });

  it("prefers MIGRATION_DATABASE_URL in drizzle-kit", () => {
    expect(read("packages/db/drizzle.config.ts")).toContain(
      "process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL",
    );
  });

  it("documents MIGRATION_DATABASE_URL in the env template", () => {
    expect(read(".env.example")).toMatch(/^MIGRATION_DATABASE_URL=postgresql:\/\//m);
  });
});
