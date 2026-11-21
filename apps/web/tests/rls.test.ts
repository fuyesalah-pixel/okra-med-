import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb } from "@okra-med/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

describe("RLS tenant isolation", () => {
  it("returns zero rows when app.tenant_id is not set", async () => {
    const rows = await db.execute(sql`SELECT * FROM tenant_users`);
    expect(rows.length).toBe(0);
  });
  it("blocks INSERT with mismatched tenant_id", async () => {
    await expect(db.execute(sql`INSERT INTO tenant_users (tenant_id, email, password_hash, name) VALUES (gen_random_uuid(), 'x@x.com', 'h', 'X')`)).rejects.toThrow();
  });
});
