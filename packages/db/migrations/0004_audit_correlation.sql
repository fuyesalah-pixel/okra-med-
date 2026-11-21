-- Phase 1 / Prompt 2: request correlation for audit rows.
--
-- Platform API mutations are audited with the request id that produced them, so an
-- audit row can be joined to a log line and a response header (x-request-id).
-- Nullable: pre-existing rows and non-HTTP writes (seed, jobs) have no request id.

ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS correlation_id varchar(63);
ALTER TABLE tenant_audit_log   ADD COLUMN IF NOT EXISTS correlation_id varchar(63);

CREATE INDEX IF NOT EXISTS platform_audit_correlation_idx ON platform_audit_log (correlation_id);
CREATE INDEX IF NOT EXISTS tenant_audit_correlation_idx   ON tenant_audit_log (correlation_id);
