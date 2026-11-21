-- Phase 1 / Prompt 3: subscription currency snapshot + composite tenant FK.

-- ---------- currency snapshot ----------
-- subscription_items previously inherited currency from live module_pricing at
-- read time. That means re-pricing a module silently re-priced every existing
-- subscription, and an invoice could not be reproduced after a price change.
-- Snapshot the currency alongside unit_price so a subscription line is a record
-- of what was sold, not a live join. Existing rows default to ETB; the seed and
-- every new line set the real currency explicitly.
ALTER TABLE subscription_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ETB';

-- ---------- composite FK ----------
-- UNIT: subscriptions(id, tenant_id) is required as the FK target. `id` is
-- already unique, so this is redundant for correctness but necessary for the
-- composite reference below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_id_tenant_id_unique'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_id_tenant_id_unique UNIQUE (id, tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_items_subscription_tenant_fk'
  ) THEN
    ALTER TABLE subscription_items
      ADD CONSTRAINT subscription_items_subscription_tenant_fk
      FOREIGN KEY (subscription_id, tenant_id)
      REFERENCES subscriptions (id, tenant_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- WHY the composite FK exists:
-- Composite FK ensures subscription_items.tenant_id always matches its
-- parent subscription's tenant_id. Together with RLS, this gives two
-- independent guards against cross-tenant writes. A future engineer
-- removing SET LOCAL app.tenant_id in the provisioning flow will still
-- fail on FK.

CREATE INDEX IF NOT EXISTS subscriptions_tenant_idx ON subscriptions (tenant_id);
