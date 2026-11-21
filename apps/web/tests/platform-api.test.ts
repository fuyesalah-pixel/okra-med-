import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  createDb,
  platformAuditLog,
  platformUsers,
  platformSettings,
  modulePricing,
  modules,
  subscriptions,
  subscriptionItems,
  tenantAuditLog,
  tenantSettings,
  tenantUsers,
  tenants,
} from "@okra-med/db";
import { sql } from "drizzle-orm";
import {
  archiveTenant,
  createModule,
  createTenant,
  dashboard,
  getTenant,
  listModules,
  listSettings,
  listTenants,
  reactivateTenant,
  setModulePricing,
  suspendTenant,
  updateModule,
  updateSetting,
  updateTenant,
} from "@/lib/platform/service";

/**
 * Integration tests for the platform control plane, against a real PostgreSQL
 * database (the same one CI migrates and seeds). They exercise the service layer,
 * which is where the behaviour lives; the route files are thin `wrapRoute`
 * adapters with no branching of their own.
 *
 * Run: DATABASE_URL=... pnpm test:platform
 */
const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);
const SLUG = `api-test-${run}`;
const slugOf = (suffix: string) => `${SLUG}-${suffix}`;

const actor = { actorId: "", email: "ci-platform@okramed.local", role: "super_admin" as const };
const admin = { ...actor, role: "super_admin" as const };

/** audit rows FK to platform_users; make sure a valid actor exists. */
async function makePlatformActor() {
  const [row] = await db
    .insert(platformUsers)
    .values({
      email: actor.email,
      passwordHash: "not-a-real-hash",
      name: "CI Platform Actor",
      role: "super_admin",
    })
    .onConflictDoUpdate({ target: platformUsers.email, set: { isActive: true } })
    .returning({ id: platformUsers.id });
  return row!.id;
}

async function auditByCorrelation(correlationId: string) {
  return db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.correlationId, correlationId));
}

async function cleanup() {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(sql`${tenants.slug} like ${`api-test-${run}%`}`);
  for (const { id } of rows) {
    // Audit rows are deliberately not cascaded: an audited tenant can be
    // archived but never hard-deleted. The fixture is the exception.
    await db.delete(tenantAuditLog).where(eq(tenantAuditLog.tenantId, id));
    await db.delete(subscriptionItems).where(eq(subscriptionItems.tenantId, id));
    await db.delete(subscriptions).where(eq(subscriptions.tenantId, id));
    await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, id));
    await db.delete(tenants).where(eq(tenants.id, id));
  }
}

beforeAll(async () => {
  const actorId = await makePlatformActor();
  actor.actorId = actorId;
  admin.actorId = actorId;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await db.$client.end();
});

describe("tenants", () => {
  it("creates a tenant with default settings and an audit row carrying the request id", async () => {
    const correlationId = `corr-${run}-create`;
    const tenant = await createTenant(
      { slug: slugOf("a"), name: "API Test Clinic A", country: "ET", trialDays: 14 },
      actor,
      { requestId: correlationId },
    );

    expect(tenant.status).toBe("trial");
    expect(tenant.trialEndsAt).not.toBeNull();

    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id));
    expect(settings?.baseCurrency).toBe("ETB");

    const [row] = await auditByCorrelation(correlationId);
    expect(row?.action).toBe("tenant.create");
    expect(row?.entityId).toBe(tenant.id);
    // PHI rule: field names only, never values.
    expect(row?.after).toEqual({ fields: expect.arrayContaining(["slug", "name", "status"]) });
  });

  it("rejects a duplicate slug with 409 instead of a raw unique-violation 500", async () => {
    await expect(
      createTenant({ slug: slugOf("a"), name: "Duplicate", country: "ET", trialDays: 0 }, actor),
    ).rejects.toMatchObject({ code: "TENANT_SLUG_TAKEN", httpStatus: 409 });
  });

  it("creates an active tenant when trialDays is 0", async () => {
    const tenant = await createTenant(
      { slug: slugOf("b"), name: "API Test Clinic B", country: "ET", trialDays: 0 },
      actor,
    );
    expect(tenant.status).toBe("active");
    expect(tenant.trialEndsAt).toBeNull();
  });

  it("lists and filters tenants by status and search", async () => {
    const found = await listTenants({ search: SLUG, limit: 50, offset: 0 });
    expect(found.total).toBe(2);

    const trial = await listTenants({ search: SLUG, status: "trial", limit: 50, offset: 0 });
    expect(trial.items.map((t) => t.slug)).toEqual([slugOf("a")]);
  });

  it("updates a tenant, and audits only the changed field names", async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slugOf("a")));
    const correlationId = `corr-${run}-update`;

    const updated = await updateTenant(
      tenant!.id,
      { name: "API Test Clinic A (renamed)" },
      actor,
      { requestId: correlationId },
    );
    expect(updated.name).toBe("API Test Clinic A (renamed)");

    const [row] = await auditByCorrelation(correlationId);
    expect(row?.action).toBe("tenant.update");
    expect(row?.before).toEqual({ fields: ["name"] });
    expect(row?.after).toEqual({ fields: ["name"] });
  });

  it("suspends (locking out users), reactivates, and refuses illegal transitions", async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slugOf("a")));

    await db.insert(tenantUsers).values({
      tenantId: tenant!.id,
      email: `user-${run}@example.com`,
      passwordHash: "x",
      name: "Suspended User",
    });

    const suspendCorr = `corr-${run}-suspend`;
    const suspended = await suspendTenant(tenant!.id, "Non-payment", actor, { requestId: suspendCorr });
    expect(suspended.status).toBe("suspended");
    expect(suspended.suspendedReason).toBe("Non-payment");

    const users = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenant!.id));
    expect(users.every((u) => u.isActive === false)).toBe(true);

    // Tenant-scoped audit table, written through RLS context.
    const [tenantRow] = await db
      .select()
      .from(tenantAuditLog)
      .where(eq(tenantAuditLog.correlationId, suspendCorr));
    expect(tenantRow?.action).toBe("tenant.suspend");
    expect(tenantRow?.tenantId).toBe(tenant!.id);
    // Platform admins are not tenant users: actor_id must stay empty and the
    // platform actor must be recorded, or the FK swallows the whole row.
    expect(tenantRow?.actorId).toBeNull();
    expect(tenantRow?.platformActorId).toBe(actor.actorId);

    const reactivated = await reactivateTenant(tenant!.id, actor);
    expect(reactivated.status).toBe("active");
    const reactivatedUsers = await db
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.tenantId, tenant!.id));
    expect(reactivatedUsers.every((u) => u.isActive === true)).toBe(true);

    const archived = await archiveTenant(tenant!.id, admin, { reason: "closed" });
    expect(archived.status).toBe("archived");

    // archived is terminal
    await expect(reactivateTenant(tenant!.id, actor)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
      httpStatus: 409,
    });
    await expect(updateTenant(tenant!.id, { name: "Nope" }, actor)).rejects.toMatchObject({
      code: "TENANT_ARCHIVED",
    });
  });

  it("returns tenant detail with settings, subscription and user counts", async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slugOf("b")));
    const detail = await getTenant(tenant!.id);
    expect(detail.tenant.slug).toBe(slugOf("b"));
    expect(detail.settings?.tenantId).toBe(tenant!.id);
    expect(detail.users).toEqual({ total: 0, active: 0 });
  });
});

describe("modules and pricing", () => {
  let moduleId = "";

  it("creates and updates a module", async () => {
    const correlationId = `corr-${run}-module`;
    const mod = await createModule(
      {
        key: `api-test-module-${run}`,
        name: "API Test Module",
        displayOrder: 99,
        isCore: false,
        isActive: true,
      },
      actor,
      { requestId: correlationId },
    );
    moduleId = mod.id;
    expect(mod.key).toBe(`api-test-module-${run}`);

    const [row] = await auditByCorrelation(correlationId);
    expect(row?.action).toBe("module.create");

    const updated = await updateModule(moduleId, { name: "API Test Module v2" }, actor);
    expect(updated.name).toBe("API Test Module v2");
  });

  it("retires the previous active price instead of overwriting it", async () => {
    await setModulePricing(moduleId, { instancePrice: 12345, currency: "ETB" }, actor);
    const corr = `corr-${run}-price`;
    const second = await setModulePricing(
      moduleId,
      { instancePrice: 15000, currency: "ETB" },
      actor,
      { requestId: corr },
    );

    const prices = await db
      .select()
      .from(modulePricing)
      .where(eq(modulePricing.moduleId, moduleId));
    expect(prices).toHaveLength(2);
    expect(prices.filter((p) => p.isActive)).toHaveLength(1);
    expect(second.isActive).toBe(true);

    const [row] = await auditByCorrelation(corr);
    expect(row?.action).toBe("module.pricing.update");

    const listed = (await listModules()).find((m) => m.id === moduleId);
    expect(listed?.pricing?.instancePrice).toBe(15000);
  });
});

describe("platform settings", () => {
  it("updates a seeded setting and audits it", async () => {
    const [setting] = await db.select().from(platformSettings).limit(1);
    expect(setting).toBeDefined();

    const corr = `corr-${run}-setting`;
    const updated = await updateSetting(
      setting!.key,
      { value: { touchedBy: "platform-api.test" } },
      actor,
      { requestId: corr },
    );
    expect(updated.value).toEqual({ touchedBy: "platform-api.test" });

    const [row] = await auditByCorrelation(corr);
    expect(row?.action).toBe("platform_setting.update");
    expect(row?.entityId).toBe(setting!.key);

    expect((await listSettings()).length).toBeGreaterThanOrEqual(4);
  });

  it("404s on an unknown setting key instead of silently creating one", async () => {
    await expect(updateSetting("nope-not-a-setting", { value: 1 }, actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
  });
});

describe("dashboard KPIs", () => {
  it("attributes MRR to the tenant's subscription and normalises the billing cycle", async () => {
    const before = await dashboard();
    const beforeTrial = before.tenants.byStatus.trial;
    const beforeMrr = before.revenue.mrr;

    const tenant = await createTenant(
      { slug: slugOf("kpi"), name: "API Test KPI Clinic", country: "ET", trialDays: 30 },
      actor,
    );

    const [activeModule] = await db
      .select({ id: modules.id, price: modulePricing.instancePrice })
      .from(modules)
      .innerJoin(modulePricing, and(eq(modulePricing.moduleId, modules.id), eq(modulePricing.isActive, true)))
      .limit(1);

    const now = new Date();
    const [sub] = await db
      .insert(subscriptions)
      .values({
        tenantId: tenant.id,
        status: "active",
        billingCycle: "annual",
        startsAt: now,
        endsAt: new Date(now.getTime() + 365 * 864e5),
      })
      .returning();

    // One annual subscription at 120_000/yr => 10_000 MRR.
    const annual = 120_000;
    await db.insert(subscriptionItems).values({
      tenantId: tenant.id,
      subscriptionId: sub!.id,
      moduleId: activeModule!.id,
      instanceCount: 1,
      unitPrice: annual,
    });

    const after = await dashboard();
    expect(after.tenants.byStatus.trial).toBe(beforeTrial + 1);
    expect(after.tenants.total).toBe(before.tenants.total + 1);
    expect(after.revenue.mrr - beforeMrr).toBe(annual / 12);
    expect(after.revenue.arr).toBe(after.revenue.mrr * 12);
    expect(after.modules.active).toBeGreaterThan(0);

    await db.delete(subscriptionItems).where(eq(subscriptionItems.subscriptionId, sub!.id));
    await db.delete(subscriptions).where(eq(subscriptions.id, sub!.id));
  });
});
