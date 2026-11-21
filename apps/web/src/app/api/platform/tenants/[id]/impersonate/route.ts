import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { tenantUsers, tenants } from "@okra-med/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { requirePlatformRole, SUPER_ADMIN_ROLES } from "@/lib/platform/auth";
import { platformDb } from "@/lib/platform/db";
import { impersonateSchema } from "@/lib/platform/schemas";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 15 * 60;

/**
 * Start an impersonation session.
 *
 * The audit row records two identities: `platform_actor_id` is the impersonator
 * (the accountable human), and `after.metadata.impersonated_tenant_user_id` is
 * the tenant user whose permissions are effective. Support can reproduce a
 * customer's problem without ever logging in as them, and every action stays
 * attributable to the admin.
 *
 * Sessions live only in Redis for 15 minutes; there is no tenant login, no
 * password reset, and nothing to replay after expiry.
 */
export const POST = wrapRoute<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requirePlatformRole(SUPER_ADMIN_ROLES);
  const input = impersonateSchema.parse(await readJson(req));
  const db = platformDb();

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1);
  if (!tenant) throw new AppError("NOT_FOUND", "Tenant not found", 404);
  if (tenant.status === "archived") {
    throw new AppError("TENANT_ARCHIVED", "Archived tenants cannot be impersonated", 409);
  }

  const [user] = await db
    .select({ id: tenantUsers.id, email: tenantUsers.email })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.id, input.userId), eq(tenantUsers.tenantId, params.id)))
    .limit(1);
  if (!user) throw new AppError("NOT_FOUND", "Tenant user not found in this tenant", 404);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  await redis.set(
    `impersonation:${token}`,
    JSON.stringify({
      tenantId: params.id,
      tenantUserId: user.id,
      platformActorId: actor.actorId,
      createdAt: new Date().toISOString(),
    }),
    "EX",
    SESSION_TTL_SECONDS,
  );

  await audit(
    {
      tenantId: params.id,
      platformActorId: actor.actorId,
      action: "platform.impersonate.start",
      entityType: "tenant_user",
      entityId: user.id,
      after: { tenantId: params.id, tenantUserId: user.id },
      metadata: { impersonated_tenant_user_id: user.id },
      correlationId: requestId,
      ...requestMeta(req),
    },
    db,
  );

  return Response.json({
    data: {
      token,
      tenantId: params.id,
      userId: user.id,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
    },
  });
});
