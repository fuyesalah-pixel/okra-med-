import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  createDb,
  modules,
  modulePricing,
  platformAuditLog,
  platformUsers,
  roles,
  subscriptionItems,
  subscriptions,
  tenantAuditLog,
  tenantSettings,
  tenantUsers,
  tenants,
  userRoles,
} from "@okra-med/db";
import { computeMonthlyBill } from "@/lib/subscription/engine";
import { provisionTenant } from "@/lib/provisioning/provision";

/**
 * Provisioning + subscription engine integration tests, against a real Postgres.
 *
 * Run them with a NON-BYPASSRLS application role, or Test 3 proves nothing:
 *
 *   DATABASE_URL=postgresql://okra_app:okra_app@localhost:5432/okramed \
 *   PLATFORM_DATABASE_URL=postgresql://okra:okra@localhost:5432/okramed \
 *   pnpm test:provisioning
 *
 * `DATABASE_URL` is intentionally the tenant role so the provisioning transaction
 * must set `app.tenant_id` to write RLS-protected rows. `PLATFORM_DATABASE_URL`
 * is the control-plane role used for assertions, fixtures and the FK test.
 */
const tenantDb = createDb(process.env.DATABASE_URL!);
const platform = createDb(process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL!);

const run = Date.now().toString(36);
const PREFIX = `prov-${run}`;
const slugOf = (suffix: string) => `${PREFIX}-${suffix}`;
const emailOf = (suffix: string) => `${PREFIX}-${suffix}@example.test`;

const actor = { actorId: "", email: `prov-actor-${run}@okramed.local`, role: "super_admin" as const };
const createdModuleIds: string[] = [];

async function makeActor() {
  const [row] = await platform
    .insert(platformUsers)
    .values({
      email: actor.email,
      passwordHash: "not-a-real-hash",
      name: "Provisioning Test Actor",
      role: "super_admin",
    })
    .onConflictDoUpdate({ target: platformUsers.email, set: { isActive: true } })
    .returning({ id: platformUsers.id });
  return row!.id;
}

/** The suite is only meaningful on a role that RLS actually applies to. */
async function assertRlsEnforced() {
  const rows = (await tenantDb.execute(
    sql`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
  )) as unknown as { rolbypassrls: boolean; rolsuper: boolean }[];
  const role = rows[0];
  expect(
    Boolean(role?.rolbypassrls || role?.rolsuper),
    "provisioning tests must run with a non-BYPASSRLS, non-superuser role (okra_app). " +
      "Running as the owner makes Test 3 pass without exercising RLS, which is the bug this suite exists to catch.",
  ).toBe(false);
}

async function provision(suffix: string, moduleKey: string, count = 1) {
  return provisionTenant(
    {
      slug: slugOf(suffix),
      name: `Provisioning ${suffix}`,
      adminEmail: emailOf(suffix),
      adminPassword: "CorrectHorse123!",
      modules: [{ key: moduleKey, count }],
      billingCycle: "monthly",
    },
    actor,
    { db: tenantDb },
  );
}

async function cleanup() {
  const rows = await platform
    .select({ id: tenants.id })
    .from(tenants)
    .where(sql`${tenants.slug} like ${`${PREFIX}%`}`);
  const ids = rows.map((r) => r.id);

  if (ids.length > 0) {
    const userIds = (
      await platform.select({ id: tenantUsers.id }).from(tenantUsers).where(inArray(tenantUsers.tenantId, ids))
    ).map((u) => u.id);

    await platform.delete(tenantAuditLog).where(inArray(tenantAuditLog.tenantId, ids));
    await platform.delete(subscriptionItems).where(inArray(subscriptionItems.tenantId, ids));
    await platform.delete(subscriptions).where(inArray(subscriptions.tenantId, ids));
    if (userIds.length > 0) {
      await platform.delete(userRoles).where(inArray(userRoles.userId, userIds));
    }
    await platform.delete(tenantUsers).where(inArray(tenantUsers.tenantId, ids));
    await platform.delete(roles).where(inArray(roles.tenantId, ids));
    await platform.delete(tenantSettings).where(inArray(tenantSettings.tenantId, ids));
    await platform.delete(platformAuditLog).where(inArray(platformAuditLog.entityId, ids));
    await platform.delete(tenants).where(inArray(tenants.id, ids));
  }

  for (const moduleId of createdModuleIds) {
    await platform.delete(modulePricing).where(eq(modulePricing.moduleId, moduleId));
    await platform.delete(modules).where(eq(modules.id, moduleId));
  }
  createdModuleIds.length = 0;
}

beforeAll(async () => {
  actor.actorId = await makeActor();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await tenantDb.$client.end();
  await platform.$client.end();
});

describe("provisionTenant", () => {
  it("Test 1: creates tenant + settings + subscription + items + admin, all with the right tenant_id", async () => {
    const correlationId = `prov-create-${run}`;
    const result = await provisionTenant(
      {
        slug: slugOf("full"),
        name: "Provisioning Full",
        adminEmail: emailOf("full"),
        adminPassword: "CorrectHorse123!",
        modules: [{ key: "registration", count: 2 }],
        billingCycle: "annual",
      },
      actor,
      { db: tenantDb, requestId: correlationId },
    );

    expect(result.tenant.slug).toBe(slugOf("full"));
    expect(result.subscription.tenantId).toBe(result.tenant.id);
    expect(result.items.length).toBe(1);
    expect(result.items.every((i) => i.tenantId === result.tenant.id)).toBe(true);

    const [settings] = await platform
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, result.tenant.id));
    expect(settings?.tenantId).toBe(result.tenant.id);

    const [admin] = await platform
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.tenantId, result.tenant.id));
    expect(admin?.email).toBe(emailOf("full"));
    expect(admin?.id).toBe(result.adminUserId);
    expect(admin?.passwordHash.startsWith("$argon2id$")).toBe(true);

    const assigned = await platform
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, result.adminUserId));
    expect(assigned.map((r) => r.roleName)).toContain("Administrator");

    const audits = await platform
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.correlationId, correlationId));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "subscription.create",
      "tenant.create",
      "tenant.provision",
    ]);
    expect(audits.every((a) => a.actorId === actor.actorId)).toBe(true);
  });

  it("Test 2: rolls back fully when a failure is injected before commit", async () => {
    await expect(
      provisionTenant(
        {
          slug: slugOf("rollback"),
          name: "Provisioning Rollback",
          adminEmail: emailOf("rollback"),
          adminPassword: "CorrectHorse123!",
          modules: [{ key: "module-that-does-not-exist", count: 1 }],
          billingCycle: "monthly",
        },
        actor,
        { db: tenantDb },
      ),
    ).rejects.toMatchObject({ code: "MODULE_NOT_PRICED" });

    const [tenant] = await platform
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slugOf("rollback")));
    expect(tenant, "rolled-back tenant must not exist").toBeUndefined();

    const users = await platform
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.email, emailOf("rollback")));
    expect(users, "rolled-back admin must not exist").toHaveLength(0);
  });

  it("Test 3: sets app.tenant_id before writing subscription_items", async () => {
    await assertRlsEnforced();

    const result = await provision("context", "consultation");

    // The insert of tenant_settings / subscription_items on a FORCE-RLS role
    // only succeeds because the transaction set app.tenant_id first. Remove that
    // line and this test goes red at the first tenant-scoped insert.
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.tenantId).toBe(result.tenant.id);

    const visible = await tenantDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${result.tenant.id}, true)`);
      return tx.select().from(subscriptionItems).where(eq(subscriptionItems.tenantId, result.tenant.id));
    });
    expect(visible).toHaveLength(1);
  });

  it("Test 4: two successive provisioning calls do not leak tenant context", async () => {
    await assertRlsEnforced();

    await provision("leak-a", "triage");

    // The pool connection has no app.tenant_id between calls; a leaked GLOBAL
    // setting would make the first tenant's admin visible here.
    const leakedA = await tenantDb
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.email, emailOf("leak-a")));
    expect(leakedA, "tenant context leaked out of the provisioning transaction").toHaveLength(0);

    await provision("leak-b", "lab");
    const leakedB = await tenantDb
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.email, emailOf("leak-b")));
    expect(leakedB).toHaveLength(0);
  });
});

describe("composite tenant FK", () => {
  it("Test 5: rejects a subscription_item whose tenant_id differs from its parent subscription (FK, not RLS)", async () => {
    const [tenantA] = await platform
      .insert(tenants)
      .values({ slug: slugOf("fk-a"), name: "FK Tenant A" })
      .returning();
    const [tenantB] = await platform
      .insert(tenants)
      .values({ slug: slugOf("fk-b"), name: "FK Tenant B" })
      .returning();

    const now = new Date();
    const [subscriptionA] = await platform
      .insert(subscriptions)
      .values({
        tenantId: tenantA!.id,
        startsAt: now,
        endsAt: new Date(now.getTime() + 30 * 864e5),
      })
      .returning();

    const [mod] = await platform.select({ id: modules.id }).from(modules).limit(1);
    expect(mod?.id).toBeDefined();

    let caught: unknown;
    try {
      await platform.transaction(async (tx) => {
        // The platform connection bypasses RLS, so only the composite FK can
        // reject this row. That is the point: the constraint holds even when the
        // session variable is wrong or absent.
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA!.id}, true)`);
        await tx.insert(subscriptionItems).values({
          tenantId: tenantB!.id,
          subscriptionId: subscriptionA!.id,
          moduleId: mod!.id,
          instanceCount: 1,
          unitPrice: 100,
          currency: "ETB",
        });
      });
    } catch (err) {
      caught = err;
    }

    expect(caught, "mismatched tenant_id must be rejected").toBeDefined();
    const message = String((caught as Error)?.message ?? "");
    expect(message, `expected a FOREIGN KEY violation, got: ${message}`).toMatch(/foreign key/i);
    expect(message, `expected FK, got RLS instead: ${message}`).not.toMatch(/row-level security/i);
  });
});

describe("subscription engine", () => {
  it("Test 6: mixed-currency subscription_items raises an error in computeMonthlyBill", async () => {
    const [tenant] = await platform
      .insert(tenants)
      .values({ slug: slugOf("mixed"), name: "Mixed Currency" })
      .returning();

    const now = new Date();
    const [subscription] = await platform
      .insert(subscriptions)
      .values({
        tenantId: tenant!.id,
        startsAt: now,
        endsAt: new Date(now.getTime() + 30 * 864e5),
      })
      .returning();

    const mods = await platform.select({ id: modules.id }).from(modules).limit(2);
    expect(mods.length).toBe(2);

    await platform.insert(subscriptionItems).values([
      {
        tenantId: tenant!.id,
        subscriptionId: subscription!.id,
        moduleId: mods[0]!.id,
        instanceCount: 1,
        unitPrice: 1000,
        currency: "ETB",
      },
      {
        tenantId: tenant!.id,
        subscriptionId: subscription!.id,
        moduleId: mods[1]!.id,
        instanceCount: 1,
        unitPrice: 2000,
        currency: "USD",
      },
    ]);

    await expect(computeMonthlyBill(subscription!.id, platform)).rejects.toMatchObject({
      code: "MULTI_CURRENCY",
      httpStatus: 422,
    });
  });

  it("Test 7: currency snapshot survives a later module_pricing currency change", async () => {
    const moduleKey = `${PREFIX}-snapshot`;
    const [mod] = await platform
      .insert(modules)
      .values({ key: moduleKey, name: "Snapshot Module" })
      .returning();
    createdModuleIds.push(mod!.id);

    await platform.insert(modulePricing).values({
      moduleId: mod!.id,
      instancePrice: 1000,
      currency: "ETB",
      isActive: true,
    });

    const result = await provision("snapshot", moduleKey);

    // Re-price the module in a different currency, the way setModulePricing does:
    // retire the old row, insert the new one.
    await platform
      .update(modulePricing)
      .set({ isActive: false })
      .where(eq(modulePricing.moduleId, mod!.id));
    await platform.insert(modulePricing).values({
      moduleId: mod!.id,
      instancePrice: 2000,
      currency: "USD",
      isActive: true,
    });

    const [item] = await platform
      .select()
      .from(subscriptionItems)
      .where(eq(subscriptionItems.subscriptionId, result.subscription.id));

    expect(item?.currency).toBe("ETB");
    expect(item?.unitPrice).toBe(1000);

    const bill = await computeMonthlyBill(result.subscription.id, platform);
    expect(bill.currency).toBe("ETB");
    expect(bill.lines[0]?.unit_price).toBe(1000);
  });
});
