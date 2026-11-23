# Architecture decisions

## Database connections — three distinct roles

1. **`DATABASE_URL`** — tenant requests. Role: `okra_app`. Subject to RLS
   (`ENABLE` + `FORCE` on every tenant table). **Never** used for platform
   aggregation queries.
2. **`PLATFORM_DATABASE_URL`** — platform admin requests. Role: `okra_platform`
   (`BYPASSRLS`). Only used by `apps/web/src/lib/platform/*` and therefore only
   by `/api/platform/*` endpoints. Must never be exposed to tenant-scoped request
   handlers or queried from tenant-facing code paths.
3. **`MIGRATION_DATABASE_URL`** — schema migrations only. Role: owner. Never used
   by application code.

Violating this separation is how RLS gets silently bypassed. If you find yourself
reaching for `PLATFORM_DATABASE_URL` in a tenant-scoped context, stop and ask why.

CI points all three at the owner because it is a throwaway database.

### Local dev on Windows: two Postgres servers

This dev machine runs two servers that are not interchangeable:

| Port | Server | Use |
|---|---|---|
| `:5432` | Native Windows Postgres | Other projects, plus the legacy `okramed` database. **Do not** migrate, seed, or run okra-med tests against it. It has no `okra_app` / `okra_platform` roles. |
| `:5433` | Docker Postgres from `docker-compose.yml`, published by the `okramed-pgproxy` container | The okra-med dev database. |

`:5433` exists because the native install already owns `:5432` on this host.
`apps/web/.env.local` (gitignored) must point at it:

```
DATABASE_URL=postgresql://okra_app:...@localhost:5433/okramed
PLATFORM_DATABASE_URL=postgresql://okra_platform:...@localhost:5433/okramed
MIGRATION_DATABASE_URL=postgresql://okra:...@localhost:5433/okramed
```

If a suite fails with an RLS denial, `relation ... does not exist`, or a missing
role, check which server it actually reached before changing code:

```
psql "$DATABASE_URL" -c 'select current_database(), inet_server_port(), current_user'
```

### Who runs migrations

`MIGRATION_DATABASE_URL` is the only connection with DDL. The `migrate` service
in `docker-compose.prod.yml` resolves its `DATABASE_URL` from
`MIGRATION_DATABASE_URL` (falling back to `DATABASE_URL` for CI, where both are
the owner), and `drizzle.config.ts` prefers it directly. `deploy.sh` runs
`run --rm migrate` before `up -d web`, so a failed migration aborts the deploy
while the previous container keeps serving.

Never give `okra_app` or `okra_platform` DDL, and never let a request path use
the migration URL.

## Audit trails

- Tenant-user actions → `tenant_audit_log` (`actor_id` → `tenant_users`).
- Platform-admin actions → `platform_audit_log` (`actor_id` → `platform_users`).
- A platform admin **acting on a tenant** writes to `tenant_audit_log` with
  `platform_actor_id` set and `actor_id` empty. A `CHECK` enforces that at most one
  actor column is set; it is not possible to record both.
- `tenant_audit_log` does **not** cascade from `tenants`. Audit records are
  evidence and must survive archival, which makes a hard delete of an audited
  tenant impossible by construction. Archive is the deletion path.
- `before` / `after` store **field names only**, never values (PHI rule, applied
  to every table, not just clinical ones).
- Every row carries `correlation_id` = the response's `x-request-id`.

## Subscriptions and money

- **Prices are snapshots, not joins.** `subscription_items` stores `unit_price`
  and `currency` at the moment the line is sold. Billing (`computeMonthlyBill`)
  reads those columns and never joins live `module_pricing`; re-pricing a module
  must not silently re-price an existing subscription, and an old invoice must be
  reproducible.
- **Quotes read live prices.** `computeQuote` is the only path that prices from
  `module_pricing`, and it never writes. The public `/api/platform/quote` endpoint
  uses it (30 requests/minute/IP).
- **One currency per line list.** `computeMonthlyBill` / `computeQuote` raise
  `MULTI_CURRENCY` (422) rather than summing ETB and USD into a meaningless total.
  Multi-currency billing is a Phase 5 feature; a wrong number is worse than an
  error.
- **Composite tenant FK.** `subscription_items (subscription_id, tenant_id)`
  references `subscriptions (id, tenant_id)`. Together with RLS this is two
  independent guards against a cross-tenant write: removing
  `SET LOCAL app.tenant_id` from provisioning still fails on the FK, and dropping
  the FK still fails on RLS. The guard test in `rls-guard.test.ts` fails CI if the
  constraint disappears — do not drop it "for performance".
- **Provisioning is one transaction.** `provisionTenant` sets `app.tenant_id` to a
  pre-generated tenant id before any tenant-scoped insert, then creates tenant,
  settings, subscription, items, and the Administrator user. A failure anywhere
  (including an unpriced module) rolls back the whole tenant; there is no partial
  tenant to repair by hand. Audits are written inside the same transaction.

## Impersonation metadata

A platform admin impersonating a tenant user writes to `tenant_audit_log` with
**both** identities:

- `platform_actor_id` — the impersonator (the accountable human).
- `after.metadata.impersonated_tenant_user_id` — the effective tenant user.

`actor_id` stays empty: the platform admin is not a `tenant_users` row. This is
the one use of `audit()`'s `metadata` field; it carries identifiers only, never
PHI or field values, and it lives in the existing `after` jsonb so no column was
added for it. Impersonation sessions are Redis-only, expire after 15 minutes, and
do not create a tenant login.

## Platform role model

- **super_admin** — full platform access. Can mutate tenants, pricing, settings,
  modules, subscriptions, notifications. Every mutation is audited.
- **platform_support** — read-only. Can view tenants, audit, dashboards and
  read-only settings. **Cannot** create, suspend, archive or modify any tenant,
  price, module or subscription. Escalation to super_admin is required for any
  mutation.

Rationale: support answers tickets; it does not cut a hospital off or rewrite the
price list. Every consequential action has a named super_admin behind it, which
is what makes the audit trail answerable.

Roles are read from `platform_users` on each request, not trusted from the session
cookie, so a demotion or deactivation takes effect immediately.
