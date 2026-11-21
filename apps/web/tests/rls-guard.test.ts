import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "@okra-med/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

describe("RLS guard: every tenant table is actually protected", () => {
  it("has RLS enabled, forced, and a tenant-scoped policy with WITH CHECK", async () => {
    const rows = await db.execute(sql`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        (SELECT count(*)::int FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count,
        (SELECT string_agg(coalesce(p.qual, '<null>'), ' | ') FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS using_clauses,
        (SELECT string_agg(coalesce(p.with_check, '<null>'), ' | ') FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS check_clauses
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenant_id'
        AND NOT a.attisdropped
    `);

    const tables = rows as any[];
    expect(tables.length, "no tenant tables found - did migrations run?").toBeGreaterThan(0);

    const violations: string[] = [];

    for (const t of tables) {
      const using = String(t.using_clauses ?? "");
      const check = String(t.check_clauses ?? "");

      if (!t.rls_enabled) violations.push(`${t.table_name}: RLS not enabled`);
      if (!t.rls_forced) violations.push(`${t.table_name}: RLS not forced`);
      if (Number(t.policy_count) < 1) violations.push(`${t.table_name}: no policy`);

      // A permissive policy ("true") passes flag checks but protects nothing.
      if (!using.includes("tenant_id") || !using.includes("current_setting")) {
        violations.push(`${t.table_name}: USING clause is not tenant-scoped (${using})`);
      }
      if (!check.includes("tenant_id") || !check.includes("current_setting")) {
        violations.push(`${t.table_name}: WITH CHECK clause is not tenant-scoped (${check})`);
      }
    }

    expect(violations, `RLS violations:\n${violations.join("\n")}`).toEqual([]);
  });
});
