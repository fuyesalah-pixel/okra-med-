-- Phase 1 / Prompt 4: Better Auth tables for the platform control plane.
--
-- The platform login page and `/api/platform-auth/*` handlers existed since
-- Prompt 1, but the adapter was configured with only a `user` model. Better Auth
-- needs `session`, `account` and `verification` to sign anyone in, so every
-- sign-in failed with SCHEMA_MISMATCH and the Super Admin UI was unreachable.
-- Tests mocked the session, which is why this survived to Prompt 4.
--
-- Tenant auth (`tenant_users`) still uses the user-only adapter; tenant UI is a
-- later phase and will need the same treatment when it is wired up.

-- Better Auth reads these two columns from every user row even when it does not
-- populate them itself.
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image text;

-- Better Auth inserts the user before writing the password to platform_accounts,
-- so a NOT NULL column with no default violates the insert.
ALTER TABLE platform_users
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE TABLE IF NOT EXISTS platform_sessions (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS platform_sessions_user_idx ON platform_sessions (user_id);

CREATE TABLE IF NOT EXISTS platform_accounts (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS platform_accounts_user_idx ON platform_accounts (user_id);

CREATE TABLE IF NOT EXISTS platform_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_verifications_identifier_idx
  ON platform_verifications (identifier);
