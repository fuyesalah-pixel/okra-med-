import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  modules,
  modulePricing,
  platformAuditLog,
  platformSettings,
  platformUsers,
  subscriptions,
  subscriptionItems,
  tenantSettings,
  tenantUsers,
  tenants,
  type Db,
} from "@okra-med/db";
import { audit, changedFields } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { withTenantContext } from "@/lib/tenant/context";
import { platformDb } from "./db";
import type { PlatformActor } from "./auth";
import type {
  createModuleSchema,
  createTenantSchema,
  pricingSchema,
  updateModuleSchema,
  updateTenantSchema,
} from "./schemas";
import type { z } from "zod";

export type TenantStatus = "trial" | "active" | "suspended" | "archived";

type Meta = { requestId?: string; ip?: string; userAgent?: string };

function notFound(what: string): never {
  throw new AppError("NOT_FOUND", `${what} not found`, 404);
}

function badRequest(code: string, message: string): never {
  throw new AppError(code, message, 400);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ---------------------------------------------------------------- tenants

export type ListTenantsInput = {
  status?: TenantStatus;
  search?: string;
  limit: number;
  offset: number;
};

export async function listTenants(input: ListTenantsInput, db: Db = platformDb()) {
  const filters = [];
  if (input.status) filters.push(eq(tenants.status, input.status));
  if (input.search) {
    const term = `%${input.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    filters.push(or(sql`${tenants.name} ILIKE ${term}`, sql`${tenants.slug} ILIKE ${term}`));
  }
  const where = filters.length ? and(...filters) : undefined;

  const [items, [totals]] = await Promise.all([
    db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        contactEmail: tenants.contactEmail,
        trialEndsAt: tenants.trialEndsAt,
        subscriptionEndsAt: tenants.subscriptionEndsAt,
        suspendedReason: tenants.suspendedReason,
        provisionedAt: tenants.provisionedAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(tenants).where(where),
  ]);

  return { items, total: Number(totals?.total ?? 0), limit: input.limit, offset: input.offset };
}

export async function getTenant(id: string, db: Db = platformDb()) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound("Tenant");

  const [settings] = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, id))
    .limit(1);

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, id))
    .orderBy(desc(subscriptions.startsAt))
    .limit(1);

  const items = subscription
    ? await db
        .select({
          id: subscriptionItems.id,
          moduleId: subscriptionItems.moduleId,
          moduleKey: modules.key,
          moduleName: modules.name,
          instanceCount: subscriptionItems.instanceCount,
          unitPrice: subscriptionItems.unitPrice,
        })
        .from(subscriptionItems)
        .innerJoin(modules, eq(modules.id, subscriptionItems.moduleId))
        .where(eq(subscriptionItems.subscriptionId, subscription.id))
    : [];

  const [[userCount], [activeUserCount]] = await Promise.all([
    db.select({ n: count() }).from(tenantUsers).where(eq(tenantUsers.tenantId, id)),
    db
      .select({ n: count() })
      .from(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, id), eq(tenantUsers.isActive, true))),
  ]);

  return {
    tenant,
    settings: settings ?? null,
    subscription: subscription ?? null,
    subscriptionItems: items,
    users: { total: Number(userCount?.n ?? 0), active: Number(activeUserCount?.n ?? 0) },
  };
}

export async function createTenant(
  input: z.infer<typeof createTenantSchema>,
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const now = new Date();
  const trialEndsAt = input.trialDays > 0 ? addDays(now, input.trialDays) : null;

  const created = await db.transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (clash) throw new AppError("TENANT_SLUG_TAKEN", `Slug "${input.slug}" is already in use`, 409);

    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: input.slug,
        name: input.name,
        status: trialEndsAt ? "trial" : "active",
        trialEndsAt,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        country: input.country,
        notes: input.notes ?? null,
      })
      .returning();

    // Row-per-tenant defaults. Without this the tenant renders with an empty theme.
    await tx.insert(tenantSettings).values({ tenantId: tenant.id });
    return tenant;
  });

  await audit(
    {
      actorId: actor.actorId,
      action: "tenant.create",
      entityType: "tenant",
      entityId: created.id,
      after: created,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return created;
}

export async function updateTenant(
  id: string,
  input: z.infer<typeof updateTenantSchema>,
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const [before] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!before) notFound("Tenant");
  if (before.status === "archived") {
    badRequest("TENANT_ARCHIVED", "Archived tenants are read-only");
  }

  const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
  if (patch.name === undefined) delete patch.name;

  const [after] = await db.update(tenants).set(patch).where(eq(tenants.id, id)).returning();

  const diff = changedFields(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );
  await audit(
    {
      actorId: actor.actorId,
      action: "tenant.update",
      entityType: "tenant",
      entityId: id,
      ...diff,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return after;
}

/** Legal status changes. An archived tenant is terminal — reactivating it would revive billing silently. */
const TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  trial: ["active", "suspended", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

async function transitionTenant(
  id: string,
  next: TenantStatus,
  actor: PlatformActor,
  opts: { reason?: string; action: string } & Meta,
) {
  const db = platformDb();
  const [before] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!before) notFound("Tenant");

  if (!TRANSITIONS[before.status].includes(next)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot change tenant from "${before.status}" to "${next}"`,
      409,
    );
  }

  const [after] = await db
    .update(tenants)
    .set({
      status: next,
      suspendedReason: next === "suspended" ? (opts.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))
    .returning();

  // Suspension must actually lock people out; the tenant flag alone does not
  // revoke live sessions or stop a login that reads only tenant_users.
  // tenant_users is RLS-protected, so this runs inside tenant context.
  const isActive = next !== "suspended" && next !== "archived";
  await withTenantContext(db, id, async (tx) => {
    await tx.update(tenantUsers).set({ isActive, updatedAt: new Date() }).where(eq(tenantUsers.tenantId, id));
  });

  await audit(
    {
      tenantId: id,
      // Recorded in the tenant's own trail, but by a platform admin: actor_id
      // FKs to tenant_users, so the platform actor has its own column.
      platformActorId: actor.actorId,
      action: opts.action,
      entityType: "tenant",
      entityId: id,
      before: { status: before.status, suspendedReason: before.suspendedReason },
      after: { status: after.status, suspendedReason: after.suspendedReason },
      correlationId: opts.requestId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    },
    db,
  );

  return after;
}

export async function suspendTenant(id: string, reason: string, actor: PlatformActor, meta: Meta = {}) {
  return transitionTenant(id, "suspended", actor, { ...meta, reason, action: "tenant.suspend" });
}

export async function reactivateTenant(id: string, actor: PlatformActor, meta: Meta = {}) {
  return transitionTenant(id, "active", actor, { ...meta, action: "tenant.reactivate" });
}

export async function archiveTenant(id: string, actor: PlatformActor, meta: Meta & { reason?: string } = {}) {
  return transitionTenant(id, "archived", actor, { ...meta, action: "tenant.archive" });
}

// ---------------------------------------------------------------- modules

export async function listModules(db: Db = platformDb()) {
  const rows = await db
    .select({
      id: modules.id,
      key: modules.key,
      name: modules.name,
      description: modules.description,
      descriptionLong: modules.descriptionLong,
      displayOrder: modules.displayOrder,
      isCore: modules.isCore,
      isActive: modules.isActive,
      priceId: modulePricing.id,
      instancePrice: modulePricing.instancePrice,
      currency: modulePricing.currency,
    })
    .from(modules)
    .leftJoin(modulePricing, and(eq(modulePricing.moduleId, modules.id), eq(modulePricing.isActive, true)))
    .orderBy(asc(modules.displayOrder), asc(modules.name));

  return rows.map(({ priceId, instancePrice, currency, ...m }) => ({
    ...m,
    pricing: priceId ? { id: priceId, instancePrice, currency } : null,
  }));
}

export async function createModule(
  input: z.infer<typeof createModuleSchema>,
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const [clash] = await db.select({ id: modules.id }).from(modules).where(eq(modules.key, input.key)).limit(1);
  if (clash) throw new AppError("MODULE_KEY_TAKEN", `Module key "${input.key}" already exists`, 409);

  const [module] = await db.insert(modules).values(input).returning();
  await audit(
    {
      actorId: actor.actorId,
      action: "module.create",
      entityType: "module",
      entityId: module.id,
      after: module,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );
  return module;
}

export async function updateModule(
  id: string,
  input: z.infer<typeof updateModuleSchema>,
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const [before] = await db.select().from(modules).where(eq(modules.id, id)).limit(1);
  if (!before) notFound("Module");

  const [after] = await db.update(modules).set(input).where(eq(modules.id, id)).returning();
  const diff = changedFields(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );
  await audit(
    {
      actorId: actor.actorId,
      action: "module.update",
      entityType: "module",
      entityId: id,
      ...diff,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );
  return after;
}

/**
 * Pricing is append-only: the previous active row is deactivated rather than
 * updated, so historical subscription_items (which snapshot unit_price) can
 * still be explained against the price that was live at the time.
 */
export async function setModulePricing(
  moduleId: string,
  input: z.infer<typeof pricingSchema>,
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const [module] = await db.select({ id: modules.id, key: modules.key }).from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!module) notFound("Module");

  const result = await db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(modulePricing)
      .where(and(eq(modulePricing.moduleId, moduleId), eq(modulePricing.isActive, true)))
      .limit(1);

    if (previous) {
      await tx.update(modulePricing).set({ isActive: false }).where(eq(modulePricing.id, previous.id));
    }

    const [created] = await tx
      .insert(modulePricing)
      .values({
        moduleId,
        instancePrice: input.instancePrice,
        currency: input.currency,
      })
      .returning();

    return { previous: previous ?? null, created };
  });

  await audit(
    {
      actorId: actor.actorId,
      action: "module.pricing.update",
      entityType: "module",
      entityId: moduleId,
      before: result.previous,
      after: result.created,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return result.created;
}

// ---------------------------------------------------------------- settings

export async function listSettings(db: Db = platformDb()) {
  return db.select().from(platformSettings).orderBy(asc(platformSettings.key));
}

export async function updateSetting(
  key: string,
  input: { value: unknown; description?: string | null },
  actor: PlatformActor,
  meta: Meta = {},
) {
  const db = platformDb();
  const [before] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  if (!before) notFound("Setting");

  const [after] = await db
    .update(platformSettings)
    .set({
      value: input.value as never,
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.key, key))
    .returning();

  await audit(
    {
      actorId: actor.actorId,
      action: "platform_setting.update",
      entityType: "platform_setting",
      entityId: key,
      before,
      after,
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return after;
}

// ---------------------------------------------------------------- dashboard

/**
 * Control-plane KPIs.
 *
 * Money is reported in minor units (ETB santim) — `modules.instance_price` is an
 * integer for exactly this reason. MRR normalises each subscription by its
 * billing cycle; multi-currency totals are grouped rather than summed, because
 * adding ETB and USD would produce a number that means nothing.
 */
export async function dashboard(db: Db = platformDb()) {
  const cycleDivisor = sql`case ${subscriptions.billingCycle}
      when 'six_months' then 6
      when 'annual' then 12
      else 1
    end`;

  const mrrAmount = sql<number>`coalesce(round(sum(${subscriptionItems.instanceCount} * ${subscriptionItems.unitPrice}::numeric / ${cycleDivisor})), 0)::int`;

  // Trials are counted from the start of today so a trial that expired earlier
  // this morning still appears in "ending today" instead of silently vanishing
  // until a daily job flips its status.
  const trialWindow = sql`${tenants.trialEndsAt} >= date_trunc('day', now()) and ${tenants.trialEndsAt} < now() + interval '7 days'`;

  const [
    byStatus,
    [moduleCounts],
    [userCounts],
    [subscriptionCounts],
    [tenantCounts],
    [trialCounts],
    recent,
    trialsEndingSoon,
    recentActivity,
  ] = await Promise.all([
    db
      .select({ status: tenants.status, n: count() })
      .from(tenants)
      .groupBy(tenants.status),
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${modules.isActive})::int`,
      })
      .from(modules),
    db.select({ total: count() }).from(tenantUsers),
    db
      .select({
        active: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')::int`,
        trialing: sql<number>`count(*) filter (where ${subscriptions.status} = 'trialing')::int`,
      })
      .from(subscriptions),
    db
      .select({
        createdThisMonth: sql<number>`count(*) filter (where ${tenants.createdAt} >= date_trunc('month', now()))::int`,
      })
      .from(tenants),
    db
      .select({
        soon: sql<number>`count(*) filter (where ${trialWindow})::int`,
        today: sql<number>`count(*) filter (where date_trunc('day', ${tenants.trialEndsAt}) = date_trunc('day', now()))::int`,
      })
      .from(tenants)
      .where(eq(tenants.status, "trial")),
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt))
      .limit(10),
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        trialEndsAt: tenants.trialEndsAt,
      })
      .from(tenants)
      .where(and(eq(tenants.status, "trial"), trialWindow))
      .orderBy(asc(tenants.trialEndsAt))
      .limit(10),
    db
      .select({
        id: platformAuditLog.id,
        action: platformAuditLog.action,
        entityType: platformAuditLog.entityType,
        entityId: platformAuditLog.entityId,
        createdAt: platformAuditLog.createdAt,
        actorName: platformUsers.name,
        actorEmail: platformUsers.email,
      })
      .from(platformAuditLog)
      .leftJoin(platformUsers, eq(platformUsers.id, platformAuditLog.actorId))
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(10),
  ]);

  // Currency is carried by module_pricing, not by the subscription_items snapshot.
  // The partial unique index `module_pricing_active_module_uq` guarantees exactly
  // one active price per module, so this join cannot multiply rows. Consequence:
  // a module whose price was deactivated contributes 0 to MRR until it is priced
  // again — acceptable for the control plane, and a signal that something is wrong.
  const mrrByCurrency = await db
    .select({ currency: modulePricing.currency, amount: mrrAmount })
    .from(subscriptionItems)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionItems.subscriptionId))
    .innerJoin(modulePricing, eq(modulePricing.moduleId, subscriptionItems.moduleId))
    .where(
      and(
        inArray(subscriptions.status, ["active", "trialing"]),
        eq(modulePricing.isActive, true),
      ),
    )
    .groupBy(modulePricing.currency);

  // "Last month" MRR is approximated by items and subscriptions that already
  // existed before the current calendar month. Seat/price changes are not
  // versioned per month, so this is a directional trend, not an invoice ledger.
  const priorMrrByCurrency = await db
    .select({ currency: modulePricing.currency, amount: mrrAmount })
    .from(subscriptionItems)
    .innerJoin(subscriptions, eq(subscriptions.id, subscriptionItems.subscriptionId))
    .innerJoin(modulePricing, eq(modulePricing.moduleId, subscriptionItems.moduleId))
    .where(
      and(
        inArray(subscriptions.status, ["active", "trialing"]),
        eq(modulePricing.isActive, true),
        sql`${subscriptionItems.createdAt} < date_trunc('month', now())`,
        sql`${subscriptions.startsAt} < date_trunc('month', now())`,
      ),
    )
    .groupBy(modulePricing.currency);

  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])) as Record<
    string,
    number
  >;
  const totalTenants = Object.values(statusMap).reduce((a, b) => a + b, 0);
  const primary = mrrByCurrency.find((r) => r.currency === "ETB") ?? mrrByCurrency[0];
  const priorPrimary = priorMrrByCurrency.find((r) => r.currency === primary?.currency);
  const previousMrr = priorPrimary?.amount ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    tenants: {
      total: totalTenants,
      byStatus: {
        trial: statusMap.trial ?? 0,
        active: statusMap.active ?? 0,
        suspended: statusMap.suspended ?? 0,
        archived: statusMap.archived ?? 0,
      },
      createdThisMonth: Number(tenantCounts?.createdThisMonth ?? 0),
      trialsExpiringIn7Days: Number(trialCounts?.soon ?? 0),
      trialsEndingToday: Number(trialCounts?.today ?? 0),
      trialsEndingSoon,
      recent,
    },
    subscriptions: {
      active: Number(subscriptionCounts?.active ?? 0),
      trialing: Number(subscriptionCounts?.trialing ?? 0),
      total: Number(subscriptionCounts?.active ?? 0) + Number(subscriptionCounts?.trialing ?? 0),
    },
    revenue: {
      currency: primary?.currency ?? "ETB",
      mrr: primary?.amount ?? 0,
      arr: (primary?.amount ?? 0) * 12,
      mrrChangePct:
        primary && previousMrr > 0
          ? Math.round(((primary.amount - previousMrr) / previousMrr) * 1000) / 10
          : null,
      byCurrency: mrrByCurrency,
    },
    recentActivity: recentActivity.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt,
      actor: row.actorName ?? row.actorEmail ?? null,
    })),
    modules: {
      total: Number(moduleCounts?.total ?? 0),
      active: Number(moduleCounts?.active ?? 0),
    },
    users: { total: Number(userCounts?.total ?? 0) },
  };
}
