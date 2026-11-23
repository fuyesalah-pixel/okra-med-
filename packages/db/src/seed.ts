import { createDb } from "./index";
import { platformUsers, platformAccounts, tenants, tenantSettings, tenantUsers, tenantAccounts, permissions, roles, rolePermissions, userRoles, modules, modulePricing, subscriptions, subscriptionItems, platformSettings } from "./schema";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import "dotenv/config";

const db = createDb(process.env.DATABASE_URL!);

const SEED_SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL;
const SEED_SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD;
const SEED_TENANT_SLUG = process.env.SEED_TENANT_SLUG;
const SEED_TENANT_ADMIN_EMAIL = process.env.SEED_TENANT_ADMIN_EMAIL;
const SEED_TENANT_ADMIN_PASSWORD = process.env.SEED_TENANT_ADMIN_PASSWORD;

if (!SEED_SUPER_ADMIN_EMAIL || !SEED_SUPER_ADMIN_PASSWORD || !SEED_TENANT_SLUG || !SEED_TENANT_ADMIN_EMAIL || !SEED_TENANT_ADMIN_PASSWORD) {
  console.error("Missing required SEED_* env vars");
  process.exit(1);
}

async function upsertPermission(key: string, module: string, description: string) {
  const existing = await db.select().from(permissions).where(eq(permissions.key, key));
  if (existing.length === 0) {
    await db.insert(permissions).values({ key, module, description });
  }
}

async function main() {
  const passwordHash = await hash(SEED_SUPER_ADMIN_PASSWORD!, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const tenantAdminHash = await hash(SEED_TENANT_ADMIN_PASSWORD!, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  // platform user (super admin)
  const existingSuper = await db.select().from(platformUsers).where(eq(platformUsers.email, SEED_SUPER_ADMIN_EMAIL!));
  let superAdminId: string;
  if (existingSuper.length === 0) {
    const inserted = await db.insert(platformUsers).values({
      email: SEED_SUPER_ADMIN_EMAIL!,
      passwordHash,
      name: "Platform Admin",
      role: "super_admin",
      isActive: true,
    }).returning();
    superAdminId = inserted[0].id;
    console.log("✅ Super admin created (TOTP secret: generate manually for 2FA)");
  } else {
    superAdminId = existingSuper[0].id;
    console.log("✅ Super admin exists");
  }

  // Better Auth stores the password credential on `platform_accounts`, not on
  // `platform_users`. Without this row the seeded admin cannot sign in even
  // though the user and hash exist.
  const existingAccount = await db
    .select({ id: platformAccounts.id })
    .from(platformAccounts)
    .where(
      and(eq(platformAccounts.userId, superAdminId), eq(platformAccounts.providerId, "credential")),
    );
  if (existingAccount.length === 0) {
    await db.insert(platformAccounts).values({
      id: randomUUID(),
      accountId: superAdminId,
      providerId: "credential",
      userId: superAdminId,
      password: passwordHash,
    });
    console.log("✅ Super admin credential created");
  }

  // tenant
  const existingTenant = await db.select().from(tenants).where(eq(tenants.slug, SEED_TENANT_SLUG!));
  let tenantId: string;
  if (existingTenant.length === 0) {
    const inserted = await db.insert(tenants).values({
      slug: SEED_TENANT_SLUG!,
      name: "Demo Clinic",
      status: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    }).returning();
    tenantId = inserted[0].id;
  } else {
    tenantId = existingTenant[0].id;
  }

  // tenant settings
  const existingSettings = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  if (existingSettings.length === 0) {
    await db.insert(tenantSettings).values({
      tenantId,
      primaryColor: "#0ea5e9",
      secondaryColor: "#64748b",
      accentColor: "#f59e0b",
      defaultLocale: "en",
      defaultCalendar: "GC",
      baseCurrency: "ETB",
      terminologyOverrides: {},
      featureFlags: {},
    });
  }

  // tenant user (admin)
  const existingTenantUser = await db.select().from(tenantUsers).where(eq(tenantUsers.email, SEED_TENANT_ADMIN_EMAIL!));
  let tenantUserId: string;
  if (existingTenantUser.length === 0) {
    const inserted = await db.insert(tenantUsers).values({
      tenantId,
      email: SEED_TENANT_ADMIN_EMAIL!,
      passwordHash: tenantAdminHash,
      name: "Demo Admin",
      isActive: true,
    }).returning();
    tenantUserId = inserted[0].id;
  } else {
    tenantUserId = existingTenantUser[0].id;
  }

  // Better Auth stores the tenant credential on `tenant_accounts`. Without this
  // row the seeded tenant admin cannot sign in even though the user exists.
  const existingTenantAccount = await db
    .select({ id: tenantAccounts.id })
    .from(tenantAccounts)
    .where(
      and(eq(tenantAccounts.userId, tenantUserId), eq(tenantAccounts.providerId, "credential")),
    );
  if (existingTenantAccount.length === 0) {
    await db.insert(tenantAccounts).values({
      id: randomUUID(),
      accountId: tenantUserId,
      providerId: "credential",
      userId: tenantUserId,
      password: tenantAdminHash,
    });
    console.log("✅ Tenant admin credential created");
  }

  // permissions catalog
  const permissionDefs: [string, string, string][] = [
    ["patient.read", "patient", "Read patients"],
    ["patient.write", "patient", "Write patients"],
    ["patient.delete", "patient", "Delete patients"],
    ["appointment.read", "appointment", "Read appointments"],
    ["appointment.write", "appointment", "Write appointments"],
    ["triage.read", "triage", "Read triage"],
    ["triage.write", "triage", "Write triage"],
    ["consultation.read", "consultation", "Read consultations"],
    ["consultation.write", "consultation", "Write consultations"],
    ["lab.order.read", "lab", "Read lab orders"],
    ["lab.order.write", "lab", "Write lab orders"],
    ["lab.result.enter", "lab", "Enter lab results"],
    ["lab.result.validate", "lab", "Validate lab results"],
    ["pharmacy.prescription.read", "pharmacy", "Read prescriptions"],
    ["pharmacy.prescription.dispense", "pharmacy", "Dispense prescriptions"],
    ["pharmacy.inventory.read", "pharmacy", "Read inventory"],
    ["pharmacy.inventory.write", "pharmacy", "Write inventory"],
    ["billing.invoice.read", "billing", "Read invoices"],
    ["billing.invoice.write", "billing", "Write invoices"],
    ["billing.payment.record", "billing", "Record payments"],
    ["ipd.admission.read", "ipd", "Read admissions"],
    ["ipd.admission.write", "ipd", "Write admissions"],
    ["ipd.nursing.write", "ipd", "Write nursing notes"],
    ["report.read", "report", "Read reports"],
    ["user.manage", "admin", "Manage users"],
    ["role.manage", "admin", "Manage roles"],
    ["settings.manage", "admin", "Manage settings"],
    ["audit.read", "admin", "Read audit logs"],
  ];
  for (const [key, mod, desc] of permissionDefs) {
    await upsertPermission(key, mod, desc);
  }

  // roles (3 system roles)
  const allPermKeys = permissionDefs.map((p) => p[0]);
  const doctorPerms = ["patient.read", "appointment.read", "triage.read", "consultation.read", "consultation.write", "lab.order.read", "lab.order.write", "pharmacy.prescription.read"];
  const receptionistPerms = ["patient.read", "patient.write", "appointment.read", "appointment.write", "triage.read", "billing.invoice.read", "billing.invoice.write", "billing.payment.record"];

  const roleDefs = [
    { name: "Administrator", perms: allPermKeys },
    { name: "Doctor", perms: doctorPerms },
    { name: "Receptionist", perms: receptionistPerms },
  ];

  const allPerms = await db.select().from(permissions);
  const permMap = new Map(allPerms.map((p) => [p.key, p.id]));

  const roleIds: Record<string, string> = {};
  for (const rd of roleDefs) {
    const existing = await db.select().from(roles).where(eq(roles.name, rd.name));
    let roleId: string;
    if (existing.length === 0) {
      const inserted = await db.insert(roles).values({
        tenantId,
        name: rd.name,
        isSystem: true,
      }).returning();
      roleId = inserted[0].id;
    } else {
      roleId = existing[0].id;
    }
    roleIds[rd.name] = roleId;
    // link permissions
    for (const pk of rd.perms) {
      const pid = permMap.get(pk);
      if (pid) {
        const existingLink = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
        const hasLink = existingLink.some((l) => l.permissionId === pid);
        if (!hasLink) {
          await db.insert(rolePermissions).values({ roleId, permissionId: pid });
        }
      }
    }
  }

  // assign Administrator role to tenant admin
  const adminRoleId = roleIds["Administrator"];
  const existingUserRole = await db.select().from(userRoles).where(eq(userRoles.userId, tenantUserId));
  if (!existingUserRole.some((ur) => ur.roleId === adminRoleId)) {
    await db.insert(userRoles).values({ userId: tenantUserId, roleId: adminRoleId });
  }

  // modules catalog
  const moduleDefs = [
    ["registration", "Patient Registration"],
    ["appointments", "Appointments & Queue"],
    ["triage", "Triage & Vitals"],
    ["consultation", "Doctor Consultation"],
    ["lab", "Laboratory"],
    ["pharmacy", "Pharmacy"],
    ["billing", "Billing"],
    ["ipd", "Inpatient (IPD)"],
    ["reports", "Reports & Analytics"],
    ["portal", "Patient Portal"],
  ];
  const modulePriceMap: Record<string, number> = {
    registration: 20000, appointments: 20000, triage: 10000, consultation: 30000,
    lab: 40000, pharmacy: 30000, billing: 20000, ipd: 50000, reports: 10000, portal: 5000,
  };
  const moduleIds: Record<string, string> = {};
  for (const [key, name] of moduleDefs) {
    const existing = await db.select().from(modules).where(eq(modules.key, key));
    let modId: string;
    if (existing.length === 0) {
      const inserted = await db.insert(modules).values({ key, name, isActive: true }).returning();
      modId = inserted[0].id;
    } else {
      modId = existing[0].id;
    }
    moduleIds[key] = modId;
    // pricing
    const existingPrice = await db.select().from(modulePricing).where(eq(modulePricing.moduleId, modId));
    if (existingPrice.length === 0) {
      await db.insert(modulePricing).values({
        moduleId: modId,
        instancePrice: modulePriceMap[key],
        currency: "ETB",
        isActive: true,
      });
    }
  }

  // platform settings
  const platformSettingDefs: [string, unknown, string][] = [
    ["base_fee", 50000, "Platform base fee per billing cycle, in minor units"],
    ["trial_days", 14, "Length of a new tenant's trial period"],
    ["default_currency", "ETB", "Currency used when a module has no explicit price"],
    ["supported_currencies", ["ETB", "USD", "EUR", "SAR"], "Currencies tenants may be billed in"],
    ["platform_name", "OkraMed", "Name shown in tenant-facing UI"],
    ["support_email", "support@okramed.com", "Support contact shown to tenants"],
  ];
  for (const [key, value, description] of platformSettingDefs) {
    await db.insert(platformSettings).values({ key, value, description }).onConflictDoNothing();
  }

  // subscription for demo tenant
  const existingSub = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  let subId: string;
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  if (existingSub.length === 0) {
    const inserted = await db.insert(subscriptions).values({
      tenantId,
      status: "trialing",
      billingCycle: "monthly",
      startsAt: new Date(),
      endsAt: trialEnd,
      trialEndsAt: trialEnd,
      nextInvoiceAt: trialEnd,
    }).returning();
    subId = inserted[0].id;
  } else {
    subId = existingSub[0].id;
  }

  // subscription items
  for (const [key] of moduleDefs) {
    const modId = moduleIds[key];
    const priceRows = await db.select().from(modulePricing).where(eq(modulePricing.moduleId, modId));
    const unitPrice = priceRows[0]?.instancePrice ?? modulePriceMap[key];
    const existingItem = await db.select().from(subscriptionItems).where(eq(subscriptionItems.subscriptionId, subId));
    const hasItem = existingItem.some((i) => i.moduleId === modId);
    if (!hasItem) {
      await db.insert(subscriptionItems).values({
        tenantId,
        subscriptionId: subId,
        moduleId: modId,
        instanceCount: 1,
        unitPrice,
      });
    }
  }

  console.log(`✅ Super admin: ${SEED_SUPER_ADMIN_EMAIL}`);
  console.log(`✅ Tenant: ${SEED_TENANT_SLUG}  admin: ${SEED_TENANT_ADMIN_EMAIL}`);
  console.log(`✅ Permissions: ${permissionDefs.length}  Roles: 3  Modules: ${moduleDefs.length}`);
  console.log(`✅ Subscription: trialing until ${trialEnd.toISOString()}`);
  console.log(`✅ Platform settings: ${platformSettingDefs.length}`);
}

main()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$client.end();
    process.exit(1);
  });
