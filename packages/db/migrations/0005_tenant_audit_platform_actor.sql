-- Phase 1 / Prompt 2, found by integration test:
-- tenant_audit_log.actor_id references tenant_users(id), so a *platform* admin
-- acting on a tenant (suspend / reactivate / archive) had no valid actor to
-- record. The insert failed with an FK violation and audit() — which must never
-- break the operation — swallowed it. The audit trail silently lost the most
-- important events in the product: a clinic being cut off.
--
-- Two actor kinds need two columns. A row should have at most one of them set.

ALTER TABLE tenant_audit_log
  ADD COLUMN IF NOT EXISTS platform_actor_id uuid REFERENCES platform_users (id);

CREATE INDEX IF NOT EXISTS tenant_audit_platform_actor_idx
  ON tenant_audit_log (platform_actor_id);

ALTER TABLE tenant_audit_log
  DROP CONSTRAINT IF EXISTS tenant_audit_one_actor_chk;

ALTER TABLE tenant_audit_log
  ADD CONSTRAINT tenant_audit_one_actor_chk
  CHECK (actor_id IS NULL OR platform_actor_id IS NULL);
