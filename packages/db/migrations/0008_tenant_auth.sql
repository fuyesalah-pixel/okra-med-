-- Phase 1 / Prompt 4.1 closure: Better Auth tables for tenant users.
--
-- Tenant login has been broken since Phase 0 for the same reason platform login
-- was: the adapter was configured with only a `user` model, so Better Auth had
-- nowhere to store a session, credential or verification token. Every
-- `/api/tenant-auth/sign-in/email` call failed with SCHEMA_MISMATCH.
--
-- These tables are deliberately *not* tenant-scoped with a `tenant_id` column:
-- authentication resolves a user from an opaque session token or email before a
-- tenant context exists, so an RLS policy keyed on `app.tenant_id` would make
-- login impossible. Isolation is enforced at the application boundary: the
-- session's `user_id` points at exactly one `tenant_users` row, and every
-- tenant request resolves that row's `tenant_id` and compares it with the slug
-- in the URL. Both tables are allowlisted in tests/rls-guard.test.ts with that
-- justification.

-- Better Auth reads these two columns from every user row even when it does not
-- populate them itself.
ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image text;

-- Better Auth inserts the user before writing the password to
-- tenant_accounts, so a NOT NULL column with no default violates the insert.
ALTER TABLE tenant_users
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE TABLE IF NOT EXISTS tenant_sessions (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_sessions_user_idx ON tenant_sessions (user_id);

CREATE TABLE IF NOT EXISTS tenant_accounts (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_accounts_user_idx ON tenant_accounts (user_id);

CREATE TABLE IF NOT EXISTS tenant_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_verifications_identifier_idx
  ON tenant_verifications (identifier);
