# Platform API (Phase 1, Prompt 2)

Base path: `/api/platform`. JSON in, JSON out. No UI yet — Prompt 4 consumes these.

## Conventions

- Success: `{ "data": ... }`. Errors: `{ "error": { "code", "message", "issues"? } }`.
- Every response carries `x-request-id`. Send your own to correlate with logs.
- 401 unauthenticated, 403 wrong platform role, 404 unknown entity, 409 illegal
  transition/duplicate, 422 schema validation, 500 unexpected.
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
| POST | `/tenants` | super_admin | Creates tenant + default settings only. **No subscription**: that is `provisionTenant` in Prompt 3 (or `POST /tenants/:id/subscription` when it lands). `{ slug, name, contactEmail?, contactPhone?, country?, notes?, trialDays? }`; `trialDays: 0` creates an `active` tenant. 409 on duplicate slug. |
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
  "tenants": { "total": 0, "byStatus": { "trial": 0, "active": 0, "suspended": 0, "archived": 0 },
               "trialsExpiringIn7Days": 0, "recent": [] },
  "revenue": { "currency": "ETB", "mrr": 0, "arr": 0, "byCurrency": [] },
  "modules": { "total": 10, "active": 10 },
  "users":   { "total": 0 }
}
```

Money is in minor units (ETB santim). MRR normalises each subscription by its
billing cycle (`monthly` ×1, `six_months` ÷6, `annual` ÷12) and is grouped by
currency rather than summed across them.

## Known constraints (deliberate, documented)

1. **Platform reads need a role that can cross tenants.** Every tenant table is
   `FORCE` RLS; `okra_app` sees zero rows there. The control plane connects with
   `PLATFORM_DATABASE_URL` (a `BYPASSRLS` role in production). CI points both
   URLs at the owner because it is a test database. Do not serve tenant traffic
   from that connection.
2. **Creating a tenant does not create a subscription.** Provisioning and the
   subscription engine are Prompt 3. A fresh tenant therefore contributes zero
   MRR and has no `subscription` in its detail payload.
3. **MRR needs an active price** to know a currency, because
   `subscription_items` snapshots `unit_price` but not currency. A module with
   no active price contributes zero. Fixing this properly means snapshotting
   currency onto `subscription_items` — a Prompt 3 schema decision.
