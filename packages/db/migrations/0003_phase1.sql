-- Phase 1 platform core: column extensions, new tables, and RLS for subscription_items.

-- ---------- enums ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_severity') THEN
    CREATE TYPE notification_severity AS ENUM ('info', 'warning', 'critical');
  END IF;
END $$;

-- ---------- column extensions ----------
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email varchar(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone varchar(31);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country varchar(2) NOT NULL DEFAULT 'ET';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_reason text;

ALTER TABLE modules ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT false;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS description_long text;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

-- ---------- platform-scoped tables (no RLS by design) ----------

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  body text NOT NULL,
  severity notification_severity NOT NULL DEFAULT 'info',
  audience uuid[] NOT NULL DEFAULT '{}'::uuid[],
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES platform_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active price per module; superseded rows are retained for price history.
CREATE UNIQUE INDEX IF NOT EXISTS module_pricing_active_module_uq
  ON module_pricing (module_id) WHERE is_active;

-- ---------- subscription_items becomes tenant-scoped ----------
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill from the parent subscription for any pre-existing rows.
UPDATE subscription_items si
SET tenant_id = s.tenant_id
FROM subscriptions s
WHERE si.subscription_id = s.id
  AND si.tenant_id IS NULL;

ALTER TABLE subscription_items ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_items_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE subscription_items
      ADD CONSTRAINT subscription_items_tenant_id_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscription_items_tenant_idx ON subscription_items (tenant_id);
CREATE INDEX IF NOT EXISTS subscription_items_subscription_idx ON subscription_items (subscription_id);

-- The catalog-driven migrations (0001/0002) ran before this table existed, so it
-- gets its policy explicitly. Same standard: FORCE + USING + WITH CHECK + nullif.
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON subscription_items;
CREATE POLICY tenant_isolation ON subscription_items
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
