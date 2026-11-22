import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "@okra-med/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

/**
 * Tables that legitimately have no tenant_id and therefore need no RLS.
 * Every entry needs a written justification: silence is not an exemption.
 */
export const PLATFORM_SCOPED_TABLES: Record<string, string> = {
  module_pricing:
    "Platform-level pricing set by the Super Admin and read by the public price calculator. Not tenant-scoped by design.",
  platform_settings:
    "Platform-wide configuration (base fee, trial length, supported currencies). Not tenant-scoped by design.",
  platform_notifications:
    "Platform-to-tenant announcements authored by the Super Admin, optionally targeted at specific tenants. Not tenant-scoped by design.",
  platform_sessions:
    "Better Auth sessions for platform admins. Control-plane only; tenant users have their own auth tables.",
  platform_accounts:
    "Better Auth credential/provider accounts for platform admins. Control-plane only. Not tenant-scoped by design.",
  platform_verifications:
    "Better Auth email verification and reset tokens for platform admins. Control-plane only. Not tenant-scoped by design.",
  tenant_sessions:
    "Better Auth sessions for tenant users. Resolved by opaque token before any tenant context exists, so an app.tenant_id policy would make login impossible. Child of tenant_users via user_id; tenant isolation is enforced when the session's user is resolved to exactly one tenant and compared with the URL slug.",
  tenant_accounts:
    "Better Auth credential/provider accounts for tenant users. Read during sign-in before a tenant context exists. Child of tenant_users via user_id; it stores no tenant data and is only reachable through that user.",
  tenant_verifications:
    "Better Auth email verification and reset tokens for tenant users. Keyed by identifier, not tenant, and read before login. Carries no tenant data.",
};

export type TenantTablePolicy = {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
  using_clauses: string | null;
  check_clauses: string | null;
};

/** Pure checker so the failure modes can be exercised without DDL privileges. */
export function findRlsViolations(
  tables: TenantTablePolicy[],
  allowlist: Record<string, string> = PLATFORM_SCOPED_TABLES,
): string[] {
  const violations: string[] = [];
  const guarded = /nullif\s*\(\s*current_setting/i;

  for (const t of tables) {
    if (t.table_name in allowlist) continue;

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

    // Without nullif, current_setting returns '' on a reused pooled connection
    // and the ::uuid cast throws at runtime, even though single-connection tests pass.
    if (!guarded.test(using)) {
      violations.push(`${t.table_name}: USING clause missing nullif(current_setting(...)) guard (${using})`);
    }
    if (!guarded.test(check)) {
      violations.push(`${t.table_name}: WITH CHECK clause missing nullif(current_setting(...)) guard (${check})`);
    }
  }

  return violations;
}

const scanQuery = sql`
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
`;

describe("RLS guard: every tenant table is actually protected", () => {
  it("has RLS enabled, forced, and a tenant-scoped policy with WITH CHECK", async () => {
    const tables = (await db.execute(scanQuery)) as unknown as TenantTablePolicy[];
    expect(tables.length, "no tenant tables found - did migrations run?").toBeGreaterThan(0);

    const violations = findRlsViolations(tables);
    expect(violations, `RLS violations:\n${violations.join("\n")}`).toEqual([]);
  });

  it("keeps the platform-scope allowlist honest", async () => {
    const entries = Object.entries(PLATFORM_SCOPED_TABLES);
    expect(entries.length).toBeGreaterThan(0);

    for (const [table, justification] of entries) {
      expect(justification.trim().length, `${table} needs a written justification`).toBeGreaterThan(20);
    }

    // An allowlisted table that has tenant_id would be silently skipping real protection.
    const tenantScoped = (await db.execute(scanQuery)) as unknown as TenantTablePolicy[];
    for (const t of tenantScoped) {
      expect(
        t.table_name in PLATFORM_SCOPED_TABLES,
        `${t.table_name} has tenant_id but is allowlisted as platform-scoped`,
      ).toBe(false);
    }
  });

  it("subscription_items has composite FK (subscription_id, tenant_id) → subscriptions(id, tenant_id)", async () => {
    const rows = (await db.execute(sql`
      SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'subscription_items'
        AND con.contype = 'f'
        AND con.conname = 'subscription_items_subscription_tenant_fk'
    `)) as unknown as { conname: string; definition: string }[];

    expect(
      rows.length,
      "subscription_items is missing its composite tenant FK. Without it, a tenant_id that differs from the parent subscription's tenant_id is only caught by RLS — drop that for one code path and cross-tenant writes become possible. Re-add it from 0006_phase1_composite_fk.sql; do not drop it for performance.",
    ).toBe(1);

    expect(rows[0]!.definition).toMatch(
      /FOREIGN KEY \(subscription_id, tenant_id\) REFERENCES subscriptions\(id, tenant_id\)/i,
    );
  });

  it("reports violations for a tenant table that loses protection", () => {
    const unprotected: TenantTablePolicy = {
      table_name: "tenant_users",
      rls_enabled: true,
      rls_forced: true,
      policy_count: 1,
      using_clauses: "true",
      check_clauses: "true",
    };
    expect(findRlsViolations([unprotected])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("USING clause is not tenant-scoped"),
        expect.stringContaining("WITH CHECK clause is not tenant-scoped"),
      ]),
    );

    const missingCheck: TenantTablePolicy = {
      ...unprotected,
      using_clauses: "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",
      check_clauses: "<null>",
    };
    expect(findRlsViolations([missingCheck])).toEqual(
      expect.arrayContaining([expect.stringContaining("WITH CHECK clause is not tenant-scoped")]),
    );

    const missingNullif: TenantTablePolicy = {
      ...unprotected,
      using_clauses: "(tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)",
      check_clauses: "(tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)",
    };
    expect(findRlsViolations([missingNullif])).toEqual(
      expect.arrayContaining([expect.stringContaining("missing nullif(current_setting(...)) guard")]),
    );

    const noRls: TenantTablePolicy = { ...unprotected, rls_enabled: false, rls_forced: false, policy_count: 0 };
    expect(findRlsViolations([noRls])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("RLS not enabled"),
        expect.stringContaining("RLS not forced"),
        expect.stringContaining("no policy"),
      ]),
    );

    // Allowlisted tables are skipped even when they carry no policy at all.
    expect(
      findRlsViolations([{ ...noRls, table_name: "platform_settings" }]),
    ).toEqual([]);
  });
});
