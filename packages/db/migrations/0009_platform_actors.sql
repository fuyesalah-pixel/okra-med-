-- Phase 1 / Prompt 4.4: price history and platform settings must name the admin
-- who made the change.
--
-- platform_audit_log deliberately stores field *names* only (the PHI rule in
-- docs/architecture.md), so an actor cannot be recovered from it for a price row.
-- These two columns are the minimum needed to render "who changed this, when".
--
-- Nullable: seeded pricing and settings predate any actor, and a deleted admin
-- must not erase the price history.

ALTER TABLE module_pricing
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES platform_users(id);

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES platform_users(id);

-- Price history is read per module, newest first.
CREATE INDEX IF NOT EXISTS module_pricing_module_created_idx
  ON module_pricing (module_id, created_at DESC);

-- The settings page edits these two alongside the original four keys. They are
-- inserted here (not only in the seed) so an already-provisioned database gets
-- them without a reseed.
INSERT INTO platform_settings (key, value, description) VALUES
  ('platform_name', '"OkraMed"'::jsonb, 'Name shown in tenant-facing UI'),
  ('support_email', '"support@okramed.com"'::jsonb, 'Support contact shown to tenants')
ON CONFLICT (key) DO NOTHING;
