import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb } from "@okra-med/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

const A_SLUG = "rls-test-a";
const B_SLUG = "rls-test-b";

let tenantA = "";
let tenantB = "";
let userA = "";
let userB = "";

const ROLLBACK = Symbol("intentional-rollback");

/** Run a query inside a transaction whose app.tenant_id is set for its lifetime. */
async function asTenant<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as any);
  });
}

/** Run assertions inside a transaction that always rolls back, so fixtures stay untouched. */
async function inRollbackTransaction(fn: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as any);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

async function cleanupFixtures() {
  const rows = await db.execute(sql`SELECT id FROM tenants WHERE slug IN (${A_SLUG}, ${B_SLUG})`);
  for (const row of rows as any[]) {
    await asTenant(row.id, (tx) => tx.execute(sql`DELETE FROM tenant_users WHERE tenant_id = ${row.id}`));
    await db.execute(sql`DELETE FROM tenants WHERE id = ${row.id}`);
  }
}

beforeAll(async () => {
  await cleanupFixtures();

  const a = await db.execute(sql`INSERT INTO tenants (slug, name) VALUES (${A_SLUG}, 'RLS Test A') RETURNING id`);
  tenantA = (a as any[])[0].id;
  const b = await db.execute(sql`INSERT INTO tenants (slug, name) VALUES (${B_SLUG}, 'RLS Test B') RETURNING id`);
  tenantB = (b as any[])[0].id;

  const ua = await asTenant(tenantA, (tx) =>
    tx.execute(sql`INSERT INTO tenant_users (tenant_id, email, password_hash, name)
      VALUES (${tenantA}, 'a@rls.test', 'h', 'A') RETURNING id`),
  );
  userA = (ua as any[])[0].id;
  const ub = await asTenant(tenantB, (tx) =>
    tx.execute(sql`INSERT INTO tenant_users (tenant_id, email, password_hash, name)
      VALUES (${tenantB}, 'b@rls.test', 'h', 'B') RETURNING id`),
  );
  userB = (ub as any[])[0].id;
});

afterAll(async () => {
  await cleanupFixtures();
  await db.$client.end();
});

describe("RLS tenant isolation", () => {
  it("returns zero rows when app.tenant_id is not set", async () => {
    const rows = await db.execute(sql`SELECT * FROM tenant_users`);
    expect(rows.length).toBe(0);
  });

  it("returns only the current tenant's rows", async () => {
    const rows = await asTenant(tenantA, (tx) => tx.execute(sql`SELECT id FROM tenant_users`));
    const ids = (rows as any[]).map((r) => r.id);
    expect(ids).toContain(userA);
    expect(ids).not.toContain(userB);
  });

  it("blocks INSERT with mismatched tenant_id via RLS (not FK)", async () => {
    await inRollbackTransaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA}, true)`);

      // Happy path: writing inside the current tenant is allowed.
      await tx.execute(sql`INSERT INTO tenant_users (tenant_id, email, password_hash, name)
        VALUES (${tenantA}, 'allowed@rls.test', 'h', 'Allowed')`);

      // Both tenant IDs exist, so a FK violation is impossible here.
      let err: any;
      try {
        await tx.execute(sql`INSERT INTO tenant_users (tenant_id, email, password_hash, name)
          VALUES (${tenantB}, 'blocked@rls.test', 'h', 'Blocked')`);
      } catch (e) {
        err = e;
      }

      expect(err, "INSERT carrying another tenant's id must be rejected").toBeDefined();
      setConfigError(err);
    });
  });

  it("blocks UPDATE that moves a row to another tenant", async () => {
    await inRollbackTransaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA}, true)`);

      let err: any;
      try {
        await tx.execute(sql`UPDATE tenant_users SET tenant_id = ${tenantB} WHERE id = ${userA}`);
      } catch (e) {
        err = e;
      }

      expect(err, "UPDATE moving a row across tenants must be rejected").toBeDefined();
      setConfigError(err);
    });
  });

  it("DELETE of another tenant's row affects 0 rows", async () => {
    await inRollbackTransaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA}, true)`);
      const deleted = await tx.execute(sql`DELETE FROM tenant_users WHERE id = ${userB} RETURNING id`);
      expect((deleted as any[]).length).toBe(0);
    });

    const stillThere = await asTenant(tenantB, (tx) =>
      tx.execute(sql`SELECT id FROM tenant_users WHERE id = ${userB}`),
    );
    expect((stillThere as any[]).length).toBe(1);
  });
});

function setConfigError(err: any) {
  const message = String(err?.message ?? "");
  expect(message, `expected an RLS violation, got: ${message}`).toMatch(/row-level security/i);
  expect(message, `expected an RLS violation, got an FK error instead: ${message}`).not.toMatch(/foreign key/i);
}
