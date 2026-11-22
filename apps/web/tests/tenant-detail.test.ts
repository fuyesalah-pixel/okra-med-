import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  createDb,
  modules,
  modulePricing,
  platformUsers,
  subscriptions,
  subscriptionItems,
  tenantAuditLog,
  tenantSettings,
  tenantUsers,
  tenants,
} from "@okra-med/db";
import {
  getTenant,
  listTenantAudit,
  listTenants,
  updateTenantSettings,
} from "@/lib/platform/service";
import {
  cancelSubscription,
  renewSubscription,
  replaceSubscriptionModules,
  startTrial,
} from "@/lib/subscription/engine";

const db = createDb(process.env.DATABASE_URL!);
const run = Date.now().toString(36);
const SLUG = `detail-test-${run}`;
const actor = { actorId: "", email: "detail-test@okramed.local", role: "super_admin" as const };

let tenantId = "";
let subscriptionId = "";
let priced: { key: string; instancePrice: number; currency: string }[] = [];

beforeAll(async () => {
  const [platformActor] = await db
    .insert(platformUsers)
    .values({
      email: actor.email,
      passwordHash: "",
      name: "Detail Test Actor",
      role: "super_admin",
    })
    .onConflictDoUpdate({ target: platformUsers.email, set: { isActive: true } })
    .returning({ id: platformUsers.id });
  actor.actorId = platformActor!.id;

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: SLUG,
      name: `Detail Test ${run}`,
      status: "trial",
      contactEmail: "clinic@detail.test",
      country: "ET",
    })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
  await db.insert(tenantSettings).values({ tenantId });

  priced = (
    await db
      .select({
        key: modules.key,
        instancePrice: modulePricing.instancePrice,
        currency: modulePricing.currency,
      })
      .from(modulePricing)
      .innerJoin(modules, eq(modules.id, modulePricing.moduleId))
      .where(and(eq(modulePricing.isActive, true), eq(modules.isActive, true)))
      .orderBy(asc(modules.displayOrder))
      .limit(2)
  ).map((row) => ({ ...row, instancePrice: Number(row.instancePrice) }));

  const subscription = await startTrial(
    tenantId,
    { modules: priced.map((p) => ({ key: p.key, count: 2 })) },
    { actor },
  );
  subscriptionId = subscription.id;
});

afterAll(async () => {
  await db.delete(tenantAuditLog).where(eq(tenantAuditLog.tenantId, tenantId));
  await db.delete(subscriptionItems).where(eq(subscriptionItems.tenantId, tenantId));
  await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
  await db.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(platformUsers).where(eq(platformUsers.email, actor.email));
  await db.$client.end();
});

describe("tenant list", () => {
  it("searches by slug and returns the module count", async () => {
    const result = await listTenants({ search: SLUG, limit: 20, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.items[0]?.slug).toBe(SLUG);
    expect(result.items[0]?.moduleCount).toBe(2);
  });

  it("filters by status and paginates", async () => {
    const trials = await listTenants({ status: "trial", limit: 20, offset: 0, search: SLUG });
    expect(trials.total).toBe(1);

    const archived = await listTenants({ status: "archived", limit: 20, offset: 0 });
    expect(archived.items.every((item) => item.status === "archived")).toBe(true);

    const page = await listTenants({ search: SLUG, limit: 1, offset: 1 });
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(1);
  });

  it("sorts by name ascending and descending", async () => {
    const asc = await listTenants({ search: SLUG, sort: "name_asc", limit: 20, offset: 0 });
    const desc = await listTenants({ search: SLUG, sort: "name_desc", limit: 20, offset: 0 });
    expect(asc.items[0]?.name).toBe(desc.items[0]?.name);
  });
});

describe("tenant detail", () => {
  it("returns settings, subscription, bill and tenant users", async () => {
    const detail = await getTenant(tenantId);
    expect(detail.tenant.slug).toBe(SLUG);
    expect(detail.settings?.tenantId).toBe(tenantId);
    expect(detail.subscription?.id).toBe(subscriptionId);
    expect(detail.subscriptionItems).toHaveLength(2);
    expect(detail.bill?.lines).toHaveLength(2);
    expect(detail.bill?.total).toBeGreaterThan(0);
    expect(detail.users.members).toEqual([]);
  });
});

describe("tenant settings", () => {
  it("updates contact and branding in one call and audits both rows", async () => {
    const before = await getTenant(tenantId);
    const result = await updateTenantSettings(
      tenantId,
      {
        contactPhone: "+251911000000",
        notes: "Updated by test",
        primaryColor: "#123456",
        accentColor: "#abcdef",
        terminologyOverrides: { patient: "Client" },
      },
      actor,
      { requestId: `settings-${run}` },
    );

    expect(result.tenant.contactPhone).toBe("+251911000000");
    expect(result.settings.primaryColor).toBe("#123456");
    expect(result.settings.terminologyOverrides).toEqual({ patient: "Client" });
    expect(result.settings.primaryColor).not.toBe(before.settings?.primaryColor);

    const audit = await db
      .select()
      .from(tenantAuditLog)
      .where(eq(tenantAuditLog.tenantId, tenantId));
    expect(audit.some((row) => row.action === "tenant.update")).toBe(true);
    expect(audit.some((row) => row.action === "tenant.settings.update")).toBe(true);
  });

  it("lists audit rows and filters by action", async () => {
    const all = await listTenantAudit(tenantId, { limit: 50, offset: 0 });
    expect(all.total).toBeGreaterThanOrEqual(3);

    const filtered = await listTenantAudit(tenantId, {
      action: "settings",
      limit: 50,
      offset: 0,
    });
    expect(filtered.items.length).toBeGreaterThan(0);
    expect(filtered.items.every((row) => row.action.includes("settings"))).toBe(true);
    expect(filtered.items[0]?.actor).toBe("Detail Test Actor");
  });
});

describe("subscription modules", () => {
  it("replaces lines, re-prices from the catalog and updates the bill", async () => {
    const target = priced[0]!;
    await replaceSubscriptionModules(
      subscriptionId,
      [{ key: target.key, count: 3 }],
      actor,
      { requestId: `modules-${run}` },
    );

    const detail = await getTenant(tenantId);
    expect(detail.subscriptionItems).toHaveLength(1);
    expect(detail.subscriptionItems[0]?.instanceCount).toBe(3);
    expect(detail.bill?.lines).toHaveLength(1);
    expect(detail.bill?.lines[0]?.subtotal).toBe(target.instancePrice * 3);

    const audit = await db
      .select()
      .from(tenantAuditLog)
      .where(sql`${tenantAuditLog.tenantId} = ${tenantId} and ${tenantAuditLog.action} = 'subscription.modules.update'`);
    expect(audit).toHaveLength(1);
  });

  it("renews by one cycle and cancels with a grace period", async () => {
    const before = await getTenant(tenantId);
    const renewed = await renewSubscription(subscriptionId, actor);
    expect(new Date(renewed.endsAt).getTime()).toBeGreaterThan(
      new Date(before.subscription!.endsAt).getTime(),
    );

    const canceled = await cancelSubscription(subscriptionId, actor);
    expect(canceled.status).toBe("canceled");
    expect(canceled.gracePeriodEndsAt).not.toBeNull();
  });
});
