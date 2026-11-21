import { platformAuditLog, tenantAuditLog, type Db } from "@okra-med/db";
import { withTenantContext } from "@/lib/tenant/context";
import { logger } from "./logger";
import { platformDb } from "./platform/db";

export type AuditParams = {
  /** Present => written to `tenant_audit_log`; absent => `platform_audit_log`. */
  tenantId?: string;
  /** Tenant user id. `tenant_audit_log.actor_id` FKs to `tenant_users`. */
  actorId?: string;
  /** Platform admin id. Use this when a platform admin acts on a tenant. */
  platformActorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  /**
   * Extra audit context stored under `after.metadata`.
   *
   * Deliberately IDs only, never PHI or field values. The one convention that
   * uses it today is impersonation: `{ impersonated_tenant_user_id }`, so a
   * platform admin's action can be attributed both to the impersonator and to
   * the effective tenant user. No column was added — metadata rides in the
   * existing `after` jsonb and is documented in docs/architecture.md.
   */
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  /** Request id from `wrapRoute`, so an audit row can be joined to logs and a response. */
  correlationId?: string;
};

/**
 * PHI rule: audit rows record *which fields* changed, never their values.
 *
 * A super-admin suspending a clinic is not PHI, but the same helper will be used
 * for patient records later, and a rule with exceptions is not a rule. Storing
 * `{ fields: ["notes"] }` is enough to reconstruct an incident timeline; storing
 * the value would put clinical free text in a second table with its own retention
 * policy.
 */
export function fieldNames(value: unknown): { fields: string[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { fields: Object.keys(value as Record<string, unknown>).sort() };
}

function auditRow(params: AuditParams) {
  const after = fieldNames(params.after);
  return {
    action: params.action.slice(0, 127),
    entityType: params.entityType.slice(0, 63),
    entityId: params.entityId ?? null,
    before: fieldNames(params.before),
    after: params.metadata
      ? { ...(after ?? { fields: [] }), metadata: params.metadata }
      : after,
    ip: params.ip?.slice(0, 63) ?? null,
    userAgent: params.userAgent ?? null,
    correlationId: params.correlationId ?? null,
  };
}

/**
 * Insert an audit row on a connection whose tenant context is already set (or
 * which is allowed to cross tenants). Use this from inside an existing
 * transaction so the audit row commits and rolls back with the operation.
 *
 * Does not open a transaction; `audit()` below is the context-managing entry
 * point for callers that are not already inside one.
 */
export async function auditInTransaction(db: Db, params: AuditParams): Promise<void> {
  const common = auditRow(params);
  try {
    if (params.tenantId) {
      await db.insert(tenantAuditLog).values({
        ...common,
        tenantId: params.tenantId,
        actorId: params.actorId ?? null,
        platformActorId: params.platformActorId ?? null,
      });
    } else {
      // platform_audit_log.actor_id already FKs to platform_users.
      await db.insert(platformAuditLog).values({
        ...common,
        actorId: params.actorId ?? params.platformActorId ?? null,
      });
    }
  } catch (err) {
    // Audit must never break the operation it describes, but a silent failure is
    // an integrity hole — log loudly and let the caller decide.
    logger.error({ err, action: params.action, entityType: params.entityType }, "audit write failed");
  }
}

export async function audit(params: AuditParams, db: Db = platformDb()): Promise<void> {
  if (params.tenantId) {
    // tenant_audit_log is a tenant table with FORCE RLS: the insert needs context.
    await withTenantContext(db, params.tenantId, (tx) =>
      auditInTransaction(tx as unknown as Db, params),
    );
    return;
  }
  await auditInTransaction(db, params);
}

/** Field-name diff for an update, used for `before`/`after` audit payloads. */
/**
 * `updatedAt` is implied by any write, and `Date` instances are never `===`
 * across two reads — comparing by reference reported three changed fields for a
 * one-field update, which would have made every audit row useless for review.
 */
const IGNORED_DIFF_FIELDS = new Set(["updatedAt"]);

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed = Object.keys(after).filter(
    (k) => !IGNORED_DIFF_FIELDS.has(k) && comparable(before[k]) !== comparable(after[k]),
  );
  return {
    before: changed.length ? pick(before, changed) : null,
    after: changed.length ? pick(after, changed) : null,
  };
}

function pick(source: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = source[k];
  return out;
}
