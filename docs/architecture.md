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
