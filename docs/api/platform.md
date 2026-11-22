# Platform API (Phase 1, Prompt 2)

Base path: `/api/platform`. JSON in, JSON out. No UI yet — Prompt 4 consumes these.

## Conventions

- Success: `{ "data": ... }`. Errors: `{ "error": { "code", "message", "issues"? } }`.
- Every response carries `x-request-id`. Send your own to correlate with logs.
- 401 unauthenticated, 403 wrong platform role, 404 unknown entity, 409 illegal
  transition/duplicate, 400 schema validation, 500 unexpected.
- Roles are read from `platform_users` on every request, not from the session
  cookie: deactivating or demoting an admin takes effect immediately.
  - `platform_support`: read-only across the control plane.
  - `super_admin`: every mutation — tenants, modules, pricing, settings, archive.
  - Support staff answer tickets; they cannot cut a hospital off or rewrite prices.
- All mutations write an audit row (platform actions → `platform_audit_log`;
  status changes → `tenant_audit_log`) with `correlation_id` and **field names
  only** in `before`/`after` — never values (PHI rule, applied everywhere).

## Endpoints

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/dashboard` | both | KPIs. Audited as `dashboard.view`. |
| GET | `/tenants?status=&search=&limit=&offset=` | both | `limit` 1–100 (default 25). |
| POST | `/tenants` | super_admin | **Provisions atomically**: tenant + settings + trialing subscription + priced items + Administrator user. `{ slug, name, adminEmail, adminPassword, modules: [{ key, count }], billingCycle?, contactEmail?, contactPhone?, country?, notes? }`. 409 on duplicate slug, 422 on an unpriced module. |
| GET | `/tenants/:id` | both | Tenant + settings + latest subscription + items + user counts. |
| PATCH | `/tenants/:id` | super_admin | `{ name?, contactEmail?, contactPhone?, country?, notes? }`. 400 if archived. |
| POST | `/tenants/:id/suspend` | super_admin | `{ reason }` (min 3). Deactivates every tenant user in the same transaction. |
| POST | `/tenants/:id/reactivate` | super_admin | Suspended → active; reactivates the tenant's users. |
| POST | `/tenants/:id/archive` | super_admin | `{ reason? }`. Terminal: no transition out. |
| GET | `/modules` | both | Modules with their active price (`pricing` or `null`). |
| POST | `/modules` | super_admin | `{ key, name, description?, descriptionLong?, displayOrder?, isCore?, isActive? }`. 409 on duplicate key. |
| PATCH | `/modules/:id` | super_admin | Any of the mutable fields. `key` is immutable. |
| PUT | `/modules/:id/pricing` | super_admin | `{ instancePrice (int, minor units), currency? }`. Retires the previous active price. |
| GET | `/settings` | both | All platform settings. |
| PATCH | `/settings/:key` | super_admin | `{ value, description? }`. 404 for unknown keys — settings are created by migration/seed, never ad hoc. |
| PATCH | `/subscriptions/:id` | super_admin | `{ action: "renew" \| "cancel" }`. Renew extends `ends_at` by one billing cycle; cancel sets `canceled` + a 7-day grace window. Audited as `subscription.renew` / `subscription.cancel`. |
| POST | `/tenants/:id/impersonate` | super_admin | `{ userId }`. Creates a 15-minute Redis session and audits `platform.impersonate.start` with `metadata.impersonated_tenant_user_id`. |
| POST | `/quote` | **public** | `{ moduleSelections: [{ key, count }] }`. Live prices, no writes, 30/min/IP. |

### Tenant status transitions

```
trial     -> active | suspended | archived
active    -> suspended | archived
suspended -> active | archived
archived  -> (terminal)
```

Anything else is `409 INVALID_TRANSITION`. Archiving is terminal so a closed
clinic cannot be silently revived into billing.

### Dashboard shape

```json
{
  "generatedAt": "2026-11-22T10:00:00.000Z",
  "tenants": { "total": 0, "byStatus": { "trial": 0, "active": 0, "suspended": 0, "archived": 0 },
               "createdThisMonth": 0,
               "trialsExpiringIn7Days": 0, "trialsEndingToday": 0,
               "trialsEndingSoon": [{ "id": "…", "name": "…", "slug": "…", "trialEndsAt": "…" }],
               "recent": [{ "id": "…", "name": "…", "slug": "…", "status": "trial", "createdAt": "…" }] },
  "subscriptions": { "active": 0, "trialing": 0, "total": 0 },
  "revenue": { "currency": "ETB", "mrr": 0, "arr": 0, "mrrChangePct": null, "byCurrency": [] },
  "recentActivity": [{ "id": "…", "action": "tenant.create", "entityType": "tenant",
                       "entityId": "…", "createdAt": "…", "actor": "Platform Admin" }],
  "modules": { "total": 10, "active": 10 },
  "users":   { "total": 0 }
}
```

`recent` and `trialsEndingSoon` are capped at 10 rows, `recentActivity` at 10
audit rows. `mrrChangePct` is `null` when there is no prior-month baseline; the
comparison counts lines that existed before the current calendar month, so it is
a directional trend rather than an invoice ledger.

Money is in minor units (ETB santim). MRR normalises each subscription by its
billing cycle (`monthly` ×1, `six_months` ÷6, `annual` ÷12) and is grouped by
currency rather than summed across them.

## Known constraints (deliberate, documented)

1. **Platform reads need a role that can cross tenants.** Every tenant table is
   `FORCE` RLS; `okra_app` sees zero rows there. The control plane connects with
   `PLATFORM_DATABASE_URL` (a `BYPASSRLS` role in production). CI points both
   URLs at the owner because it is a test database. Do not serve tenant traffic
   from that connection.
2. **`POST /tenants` now provisions the subscription too.** A tenant created
   before Prompt 3 (or by the old service helper) may still have no subscription
   and contribute zero MRR.
3. **MRR needs an active price** to know a currency, because
   `subscription_items` snapshots `unit_price` but not currency. A module with
   no active price contributes zero. Fixing this properly means snapshotting
   currency onto `subscription_items` — a Prompt 3 schema decision.
