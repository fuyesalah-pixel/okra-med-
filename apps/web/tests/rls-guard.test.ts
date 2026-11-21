import { describe, it, expect } from "vitest";
import { createDb } from "@okra-med/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

describe("RLS guard: all tenant tables have RLS", () => {
  it("every table with tenant_id column has RLS enabled and forced", async () => {
    const rows = await db.execute(sql`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE a.attname = 'tenant_id' AND c.relkind = 'r'
    `);
    for (const r of rows as any[]) {
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
  });
});
