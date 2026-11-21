# Verification Log

Every phase must show: **baseline green → break-it red → restore green**.
A phase without those three runs is not verified, regardless of test counts.

## Phase 0 — Foundation + RLS Spine (2026-11-21)

- Baseline (final, with `nullif` guard): https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44892390618 (`1a66750a`)
- Break-it: https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44891805508 (`a9960e93`) — 6/6 red
- Restore: https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44891890977 (`0ba9130a`)
- Baseline (suite hardened, pre-`nullif` guard): https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44891676616 (`f7061303`)
- Guard: detects permissive `USING`, detects missing `WITH CHECK`, 0 violations at baseline
- Tag: `v0.1.0`

### What the break-it proved

A single permissive policy (`USING (true) WITH CHECK (true)`) on **one** table
(`tenant_users`) turns all six assertions red, including the policy-content guard.
Earlier revisions of this suite failed only 1 of 3 — the INSERT case was passing
on a foreign-key violation rather than RLS, and the guard only inspected
`relrowsecurity` flags.

### Defects found by verification, not by reading

| Defect | Consequence if shipped |
| --- | --- |
| `okra` connected as superuser (`rolbypassrls`) | RLS assertions were theater; every test passed with RLS defeated |
| `0001_rls.sql` missing from drizzle's `_journal.json` | RLS was never applied at all |
| Migration listed join tables with no `tenant_id` column | Whole migration run rolled back |
| Policy had no `WITH CHECK` | Cross-tenant **writes** allowed, reads filtered |
| `current_setting('app.tenant_id', true)` returning `''` on a reused pooled connection | `''::uuid` throws once pooling is exercised in production |
| `seed.ts` never closed its pool | CI hangs after the seed step |
| INSERT isolation test rejected by FK, not RLS | Cross-tenant write leak would pass CI |

### Standing rules going forward

1. Every tenant table gets RLS + `FORCE` + a policy with both `USING` and `WITH CHECK`,
   written as `nullif(current_setting('app.tenant_id', true), '')::uuid`.
2. The guard test is the source of truth for (1) — it inspects policy content, not flags.
3. RLS tests connect as a non-superuser role (`okra_app`). A superuser connection proves nothing.
4. Before any break-it test, ask: *which layer does this suite actually exercise?* Break that layer.
5. Break-it commits stay in history. They are the evidence that the suite detects real faults.

## Phase 1 — Platform Core

### Prompt 1 — Schema + Guard (accepted 2026-11-21)

- CI run: https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44893154951 (`f1836330`) ✅
- `subscription_items` gained `tenant_id` + the full RLS standard. It previously had
  no `tenant_id` column at all, so the catalog-driven RLS migrations of `0001`/`0002`
  could never cover it — a live cross-tenant read/write leak, invisible until a
  subscription bug surfaced it.
- Guard test extended: `PLATFORM_SCOPED_TABLES` with a written justification per entry,
  plus an honesty check that fails when a tenant table is hand-waved into the allowlist.
- 8/8 RLS tests green locally and in CI (3 guard + 5 isolation).
- Deviations accepted: guard file kept at the repo's `apps/web/tests/` path; synthetic-row
  testing of `findRlsViolations()` instead of DDL temp tables (the app role has no `CREATE`
  on `public`, and `pg_temp` is outside the catalog scan — the test would pass without
  exercising the scan); `0003_phase1.sql` hand-written rather than generated, because the
  stale `meta/` baseline would re-emit `0001`/`0002` objects. See `packages/db/README.md`.
### Prompt 2 — Platform API core (2026-11-21)

Local verification on a fresh `postgres:16-alpine` (port 55432, hand-migrated and
seeded): **20/20 green** — 8 RLS (3 guard + 5 isolation) + 12 platform API.

- Built: `wrapRoute` (correlation id + error envelope), role guard reading the role
  from `platform_users` on every request, tenants CRUD + suspend/reactivate/archive
  with a transition table, modules CRUD, append-only module pricing, platform
  settings, dashboard KPIs. Contract: `docs/api/platform.md`.
- `/dashboard` itself is audited (`dashboard.view`) — reading the book of business
  is an access, not a no-op.

#### Defects found by the tests, not by reading

| Defect | Consequence if shipped |
| --- | --- |
| `tenant_audit_log.actor_id` FKs to `tenant_users`; a platform admin is not a tenant user | Every suspend/reactivate/archive audit insert failed on FK, and `audit()` — which must not break the operation — swallowed it. The audit trail silently lost precisely the events that matter most. Fixed by `0005`: separate `platform_actor_id` column + one-actor check constraint. |
| `changedFields()` compared values by reference | A one-field tenant update audited three changed fields (`createdAt`, `trialEndsAt`, `updatedAt`), because `Date` instances are never `===` across reads. Now compares normalised values and ignores `updatedAt`. |
| `logger` used a `pino-pretty` transport that is not a dependency | Would throw on the first platform request in development — every new route imports `logger`. JSON logging in all environments. |
| Audit rows are not cascaded from `tenants` | An audited tenant cannot be hard-deleted at all. This is intended (archive is the deletion path) and the fixture cleans up explicitly. |

#### Notes / deviations

- Zod schemas live in `apps/web/src/lib/platform/schemas.ts`, not `packages/shared` —
  that package has no `package.json` yet and adding one would change the workspace +
  lockfile for no benefit at this size. Move them when a second consumer appears (Prompt 4).
- `z.unknown()` infers as optional, so `PATCH /settings/:key` enforces `value` presence
  explicitly in the route (422) rather than relying on the schema.
- Migrations `0004_audit_correlation` and `0005_tenant_audit_platform_actor` were added
  by this prompt, so the composite-FK migration from Prompt 3 becomes `0006`.
- `PLATFORM_DATABASE_URL` is the control-plane connection (needs `BYPASSRLS`). CI points
  both URLs at the owner: fine for a test DB, never the production shape.

- **Deferred and ruled YES:** composite FK `(subscription_id, tenant_id)` on
  `subscription_items` → `subscriptions(id, tenant_id)`, to land in Prompt 3. Tenant
  boundaries are invariants, not behaviours: a constraint refuses the invalid state at
  write time, a test only proves today's code path. Together with RLS this gives two
  independent guards against a cross-tenant write.
