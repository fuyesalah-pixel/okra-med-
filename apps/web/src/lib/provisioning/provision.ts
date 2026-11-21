import { randomUUID } from "node:crypto";
import { argon2id, hash } from "argon2";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  modules,
  modulePricing,
  permissions,
  platformSettings,
  rolePermissions,
  roles,
  subscriptions,
  subscriptionItems,
  tenantSettings,
  tenantUsers,
  tenants,
  userRoles,
  type Db,
} from "@okra-med/db";
import { auditInTransaction } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { platformDb } from "@/lib/platform/db";
import type { PlatformActor } from "@/lib/platform/auth";
import type { BillingCycle, ModuleSelection } from "@/lib/subscription/engine";

export type ProvisionInput = {
  slug: string;
  name: string;
  adminEmail: string;
  adminPassword: string;
  modules: ModuleSelection[];
  billingCycle: BillingCycle;
  contactEmail?: string | null;
  contactPhone?: string | null;
  country?: string;
  notes?: string | null;
};

export type ProvisionResult = {
  tenant: typeof tenants.$inferSelect;
  subscription: typeof subscriptions.$inferSelect;
  adminUserId: string;
  items: (typeof subscriptionItems.$inferSelect)[];
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Provision a tenant end to end: tenant, settings, subscription, priced items,
 * an Administrator user, and the audit trail — in a single transaction.
 *
 * No partial tenant is ever observable. That matters because a tenant with a
 * subscription but no administrator (or vice versa) cannot be repaired through
 * the UI; it needs a human with SQL.
 *
 * The tenant id is generated before `BEGIN` so `app.tenant_id` can be set as the
 * first statement. Every tenant-scoped insert below is then legal for a plain
 * `okra_app` connection, and RLS is exercised rather than bypassed.
 */
export async function provisionTenant(
  input: ProvisionInput,
  actor: PlatformActor,
  opts: { db?: Db; requestId?: string; ip?: string; userAgent?: string } = {},
): Promise<ProvisionResult> {
  const db = opts.db ?? platformDb();
  const tenantId = randomUUID();
  const now = new Date();

  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Db;

    // STEP 1: set the tenant context before any tenant-scoped row is written.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);

    const [clash] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
      .limit(1);
    if (clash) {
      throw new AppError("TENANT_SLUG_TAKEN", `Slug "${input.slug}" is already in use`, 409);
    }

    const [trialSetting] = await tx
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, "trial_days"))
      .limit(1);
    const trialDays = typeof trialSetting?.value === "number" ? trialSetting.value : 14;
    const trialEndsAt = addDays(now, trialDays);

    // STEP 2: tenant + row-per-tenant settings.
    const [tenant] = await tx
      .insert(tenants)
      .values({
        id: tenantId,
        slug: input.slug,
        name: input.name,
        status: "trial",
        trialEndsAt,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        country: input.country ?? "ET",
        notes: input.notes ?? null,
        provisionedAt: now,
      })
      .returning();

    await tx.insert(tenantSettings).values({ tenantId });

    // STEP 3: subscription. Prices are resolved *after* the subscription is
    // inserted so a pricing failure proves the transaction rolls back fully.
    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        tenantId,
        status: "trialing",
        billingCycle: input.billingCycle,
        startsAt: now,
        endsAt: trialEndsAt,
        trialEndsAt,
        nextInvoiceAt: trialEndsAt,
      })
      .returning();

    const keys = input.modules.map((m) => m.key);
    const priced = await tx
      .select({
        moduleId: modules.id,
        key: modules.key,
        instancePrice: modulePricing.instancePrice,
        currency: modulePricing.currency,
      })
      .from(modulePricing)
      .innerJoin(modules, eq(modules.id, modulePricing.moduleId))
      .where(and(eq(modulePricing.isActive, true), inArray(modules.key, keys)));

    const priceByKey = new Map(priced.map((p) => [p.key, p]));

    const items = input.modules.map((selection) => {
      const price = priceByKey.get(selection.key);
      if (!price) {
        throw new AppError(
          "MODULE_NOT_PRICED",
          `Module "${selection.key}" does not exist or has no active price`,
          422,
        );
      }
      if (selection.count < 1) {
        throw new AppError("VALIDATION", `Instance count for "${selection.key}" must be positive`, 422);
      }
      return {
        tenantId,
        subscriptionId: subscription!.id,
        moduleId: price.moduleId,
        instanceCount: selection.count,
        unitPrice: price.instancePrice,
        currency: price.currency,
      };
    });

    const insertedItems = await tx.insert(subscriptionItems).values(items).returning();

    // STEP 4: the administrator. A tenant without one cannot be used or fixed
    // through the product, so this belongs in the same transaction.
    const passwordHash = await hash(input.adminPassword, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const [adminUser] = await tx
      .insert(tenantUsers)
      .values({
        tenantId,
        email: input.adminEmail,
        passwordHash,
        name: "Administrator",
        isActive: true,
      })
      .returning();

    const [adminRole] = await tx
      .insert(roles)
      .values({ tenantId, name: "Administrator", description: "Tenant administrator", isSystem: true })
      .returning();

    const allPermissions = await tx.select({ id: permissions.id }).from(permissions);
    if (allPermissions.length > 0) {
      await tx.insert(rolePermissions).values(
        allPermissions.map((p) => ({ roleId: adminRole!.id, permissionId: p.id })),
      );
    }

    await tx.insert(userRoles).values({ userId: adminUser!.id, roleId: adminRole!.id });

    // STEP 5: audit rows ride in the same transaction, so a rollback leaves no
    // evidence of a tenant that never existed.
    const meta = { correlationId: opts.requestId, ip: opts.ip, userAgent: opts.userAgent };
    await auditInTransaction(scoped, {
      platformActorId: actor.actorId,
      action: "tenant.create",
      entityType: "tenant",
      entityId: tenantId,
      after: tenant,
      ...meta,
    });
    await auditInTransaction(scoped, {
      platformActorId: actor.actorId,
      action: "tenant.provision",
      entityType: "tenant",
      entityId: tenantId,
      after: { slug: tenant!.slug, modules: items.length, billingCycle: input.billingCycle },
      ...meta,
    });
    await auditInTransaction(scoped, {
      platformActorId: actor.actorId,
      action: "subscription.create",
      entityType: "subscription",
      entityId: subscription!.id,
      after: { status: "trialing", billingCycle: input.billingCycle },
      ...meta,
    });

    return {
      tenant: tenant!,
      subscription: subscription!,
      adminUserId: adminUser!.id,
      items: insertedItems,
    };
  });
}
