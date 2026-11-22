import { and, eq, inArray, sql } from "drizzle-orm";
import {
  modules,
  modulePricing,
  platformSettings,
  subscriptions,
  subscriptionItems,
  type Db,
} from "@okra-med/db";
import { audit, auditInTransaction } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { platformDb } from "@/lib/platform/db";
import type { PlatformActor } from "@/lib/platform/auth";

/**
 * Subscription engine.
 *
 * Money is integer minor units (ETB santim / USD cents). Never floats.
 *
 * Two rules make an invoice reproducible:
 *   1. `subscription_items.unit_price` and `.currency` are snapshots taken at
 *      sale time. Billing must not join live `module_pricing`.
 *   2. A subscription line list is single-currency. Summing ETB and USD would
 *      produce a meaningless number, so a mixed set is an error until Phase 5.
 */

export type BillingCycle = "monthly" | "six_months" | "annual";

export type ModuleSelection = { key: string; count: number };

export type BillLine = {
  module: string;
  instance_count: number;
  unit_price: number;
  subtotal: number;
};

export type Bill = {
  base_fee: number;
  currency: string;
  lines: BillLine[];
  total: number;
};

type Meta = { requestId?: string; ip?: string; userAgent?: string };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function addBillingCycle(date: Date, cycle: BillingCycle): Date {
  switch (cycle) {
    case "monthly":
      return addMonths(date, 1);
    case "six_months":
      return addMonths(date, 6);
    case "annual":
      return addMonths(date, 12);
  }
}

async function settingNumber(db: Db, key: string, fallback: number): Promise<number> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  return typeof row?.value === "number" ? row.value : fallback;
}

async function settingString(db: Db, key: string, fallback: string): Promise<string> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  return typeof row?.value === "string" ? row.value : fallback;
}

function singleCurrency(currencies: string[]): string | null {
  const unique = [...new Set(currencies)];
  if (unique.length > 1) {
    throw new AppError(
      "MULTI_CURRENCY",
      `Subscription mixes currencies (${unique.join(", ")}). Multi-currency billing is not supported yet.`,
      422,
    );
  }
  return unique[0] ?? null;
}

type PricedModule = {
  moduleId: string;
  key: string;
  name: string;
  instancePrice: number;
  currency: string;
};

/**
 * Resolve module selections against the *current active* price. Used for quotes
 * and for taking the snapshot when a subscription is created. Never used to
 * price an existing subscription — that is `computeMonthlyBill`.
 */
async function priceSelections(
  db: Db,
  selections: ModuleSelection[],
): Promise<(PricedModule & { count: number })[]> {
  if (selections.length === 0) {
    throw new AppError("VALIDATION", "At least one module is required", 422);
  }

  const keys = selections.map((s) => s.key);
  const rows = await db
    .select({
      moduleId: modules.id,
      key: modules.key,
      name: modules.name,
      instancePrice: modulePricing.instancePrice,
      currency: modulePricing.currency,
    })
    .from(modulePricing)
    .innerJoin(modules, eq(modules.id, modulePricing.moduleId))
    .where(and(eq(modulePricing.isActive, true), inArray(modules.key, keys)));

  const byKey = new Map(rows.map((r) => [r.key, r]));

  return selections.map((selection) => {
    const priced = byKey.get(selection.key);
    if (!priced) {
      throw new AppError(
        "MODULE_NOT_PRICED",
        `Module "${selection.key}" does not exist or has no active price`,
        422,
      );
    }
    return { ...priced, count: selection.count };
  });
}

/** Current price of a selection list. No writes, no side effects. */
export async function computeQuote(
  input: { moduleSelections: ModuleSelection[] },
  db: Db = platformDb(),
): Promise<Bill> {
  const priced = await priceSelections(db, input.moduleSelections);
  const currency = singleCurrency(priced.map((p) => p.currency)) ?? (await settingString(db, "default_currency", "ETB"));
  const baseFee = await settingNumber(db, "base_fee", 0);

  const lines: BillLine[] = priced.map((p) => ({
    module: p.key,
    instance_count: p.count,
    unit_price: p.instancePrice,
    subtotal: p.count * p.instancePrice,
  }));

  return {
    base_fee: baseFee,
    currency,
    lines,
    total: baseFee + lines.reduce((sum, line) => sum + line.subtotal, 0),
  };
}

/**
 * Bill an existing subscription from its snapshots.
 *
 * Reads `platform_settings.base_fee` and `subscription_items` only. The module
 * catalog is joined for the *display key*; prices and currency come from the
 * line, never from live `module_pricing`.
 */
export async function computeMonthlyBill(
  subscriptionId: string,
  db: Db = platformDb(),
): Promise<Bill> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  if (!subscription) throw new AppError("NOT_FOUND", "Subscription not found", 404);

  const rows = await db
    .select({
      module: modules.key,
      instanceCount: subscriptionItems.instanceCount,
      unitPrice: subscriptionItems.unitPrice,
      currency: subscriptionItems.currency,
    })
    .from(subscriptionItems)
    .innerJoin(modules, eq(modules.id, subscriptionItems.moduleId))
    .where(eq(subscriptionItems.subscriptionId, subscriptionId));

  const currency =
    singleCurrency(rows.map((r) => r.currency)) ?? (await settingString(db, "default_currency", "ETB"));
  const baseFee = await settingNumber(db, "base_fee", 0);

  const lines: BillLine[] = rows.map((r) => ({
    module: r.module,
    instance_count: r.instanceCount,
    unit_price: r.unitPrice,
    subtotal: r.instanceCount * r.unitPrice,
  }));

  return {
    base_fee: baseFee,
    currency,
    lines,
    total: baseFee + lines.reduce((sum, line) => sum + line.subtotal, 0),
  };
}

/**
 * Create a trialing subscription and snapshot each line's price + currency.
 * Runs in one transaction, with the tenant RLS context set, so the items are
 * visible to the tenant role and roll back together.
 */
export async function startTrial(
  tenantId: string,
  input: { modules: ModuleSelection[]; billingCycle?: BillingCycle },
  opts: { db?: Db; actor?: PlatformActor } & Meta = {},
) {
  const db = opts.db ?? platformDb();
  const billingCycle = input.billingCycle ?? "monthly";
  const now = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sqlSetTenant(tenantId));

    const trialDays = await settingNumber(tx as unknown as Db, "trial_days", 14);
    const trialEndsAt = addDays(now, trialDays);
    const priced = await priceSelections(tx as unknown as Db, input.modules);

    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        tenantId,
        status: "trialing",
        billingCycle,
        startsAt: now,
        endsAt: trialEndsAt,
        trialEndsAt,
        nextInvoiceAt: trialEndsAt,
      })
      .returning();

    await tx.insert(subscriptionItems).values(
      priced.map((p) => ({
        tenantId,
        subscriptionId: subscription!.id,
        moduleId: p.moduleId,
        instanceCount: p.count,
        unitPrice: p.instancePrice,
        currency: p.currency,
      })),
    );

    await auditInTransaction(tx as unknown as Db, {
      tenantId,
      platformActorId: opts.actor?.actorId,
      action: "subscription.create",
      entityType: "subscription",
      entityId: subscription!.id,
      after: { status: "trialing", billingCycle },
      correlationId: opts.requestId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return subscription!;
  });
}

async function loadSubscription(subscriptionId: string, db: Db) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  if (!subscription) throw new AppError("NOT_FOUND", "Subscription not found", 404);
  return subscription;
}

/** Extend an existing subscription by one billing cycle. */
export async function renewSubscription(
  subscriptionId: string,
  actor: PlatformActor,
  meta: Meta & { db?: Db } = {},
) {
  const db = meta.db ?? platformDb();
  const before = await loadSubscription(subscriptionId, db);
  const now = new Date();
  const from = before.endsAt > now ? before.endsAt : now;
  const endsAt = addBillingCycle(from, before.billingCycle);

  const [after] = await db
    .update(subscriptions)
    .set({ endsAt, nextInvoiceAt: endsAt, updatedAt: now })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  await audit(
    {
      tenantId: before.tenantId,
      platformActorId: actor.actorId,
      action: "subscription.renew",
      entityType: "subscription",
      entityId: subscriptionId,
      before: { endsAt: before.endsAt },
      after: { endsAt: after!.endsAt },
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return after!;
}

/**
 * Replace a subscription's module lines with a new selection.
 *
 * Re-prices from the current active catalog and re-snapshots each line, then
 * deletes the old lines and inserts the new ones in one transaction. Historical
 * invoices are not affected because each line is a snapshot, but the current
 * subscription now bills the new selection.
 */
export async function replaceSubscriptionModules(
  subscriptionId: string,
  moduleSelections: ModuleSelection[],
  actor: PlatformActor,
  meta: Meta & { db?: Db } = {},
) {
  const db = meta.db ?? platformDb();

  return db.transaction(async (tx) => {
    const before = await loadSubscription(subscriptionId, tx as unknown as Db);
    const priced = await priceSelections(tx as unknown as Db, moduleSelections);
    singleCurrency(priced.map((p) => p.currency));

    await tx.execute(sqlSetTenant(before.tenantId));
    await tx
      .delete(subscriptionItems)
      .where(eq(subscriptionItems.subscriptionId, subscriptionId));
    await tx.insert(subscriptionItems).values(
      priced.map((p) => ({
        tenantId: before.tenantId,
        subscriptionId,
        moduleId: p.moduleId,
        instanceCount: p.count,
        unitPrice: p.instancePrice,
        currency: p.currency,
      })),
    );

    const [after] = await tx
      .update(subscriptions)
      .set({ updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await auditInTransaction(tx as unknown as Db, {
      tenantId: before.tenantId,
      platformActorId: actor.actorId,
      action: "subscription.modules.update",
      entityType: "subscription",
      entityId: subscriptionId,
      before: { modules: moduleSelections.length },
      after: {
        modules: priced.map((p) => ({ key: p.key, count: p.count, unitPrice: p.instancePrice })),
      },
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return after!;
  });
}

/** Cancel immediately, with a 7-day grace window before access is cut. */
export async function cancelSubscription(
  subscriptionId: string,
  actor: PlatformActor,
  meta: Meta & { db?: Db } = {},
) {
  const db = meta.db ?? platformDb();
  const before = await loadSubscription(subscriptionId, db);
  const now = new Date();

  const [after] = await db
    .update(subscriptions)
    .set({
      status: "canceled",
      gracePeriodEndsAt: addDays(now, 7),
      updatedAt: now,
    })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  await audit(
    {
      tenantId: before.tenantId,
      platformActorId: actor.actorId,
      action: "subscription.cancel",
      entityType: "subscription",
      entityId: subscriptionId,
      before: { status: before.status },
      after: { status: after!.status, gracePeriodEndsAt: after!.gracePeriodEndsAt },
      correlationId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    db,
  );

  return after!;
}

function sqlSetTenant(tenantId: string) {
  // Kept as a named helper so the break-it test can target exactly one line.
  return sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}
