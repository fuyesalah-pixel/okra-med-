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

## Deploy workflow — triage (2026-11-21)

**Status: three defects fixed, one blocker outstanding (missing repository secrets).**

The `Deploy` workflow had been red on every push since Phase 0. It never reached the
SSH step, so nothing was ever deployed and nothing said so.

| # | Root cause | How it was found | Fix |
| --- | --- | --- | --- |
| 1 | `pnpm/action-setup@v4` declared `version: 9` while `package.json` declares `packageManager: pnpm@9.15.0` → `Error: Multiple versions of pnpm specified`, step 3 of 9, every run | CI job log | removed `version:` — the action reads `packageManager` |
| 2 | `next lint` had no ESLint config, so it prompted interactively and exited 1 | ran `pnpm lint` locally | added `apps/web/.eslintrc.json` (`next/core-web-vitals`) and fixed the two errors it then reported (`const module` → `const created` / `updated` in the new platform module routes) |
| 3 | `apps/web/Dockerfile` copied `packages/shared/package.json`, which does not exist; and never copied `pnpm-lock.yaml`, so `--frozen-lockfile` could never succeed; and builder copied only the root `node_modules`, so pnpm workspace links were lost | `docker build` locally | restructured deps/builder stages, pinned `pnpm@9.15.0`, added `.dockerignore` |
| 4 | `deploy.sh` probed `curl http://localhost:3000/api/_health` **from the host**, but `docker-compose.prod.yml` publishes no port for `web` (Caddy reaches it over the internal network) — a healthy deploy would still have been reported as failed | reading the compose file | probe with `docker compose exec -T web wget -qO- …`, same probe the Dockerfile `HEALTHCHECK` already uses |
| 5 | `test:rls` ran with no `DATABASE_URL` and no database in the Deploy job | reading the workflow | added a `postgres` service, `db:migrate`, `db:seed`, the non-superuser role, and `test:platform` to the push gate |
| 6 | `builder` stage ran `pnpm` without installing it — each Docker stage is a fresh image | `docker build` locally | pin `pnpm@9.15.0` in the builder stage too |
| 7 | runner stage copied `/app/apps/web/public`, which does not exist in the repo | `docker build` locally | added `apps/web/public/.gitkeep` |
| 9 | Next's standalone server binds to `$HOSTNAME`, which Docker sets to the container id — the app listened on the container IP only, so **every in-container probe got ECONNREFUSED** while port-mapped traffic worked. A container that serves fine and reports permanently unhealthy | built the image and inspected `State.Health` | `ENV HOSTNAME=0.0.0.0` in the runner stage |
| 10 | Even then, probing `localhost:3000` failed: Alpine resolves `localhost` to `::1` first and Node binds IPv4 only | `wget` inside the container | probe `127.0.0.1:3000` in `HEALTHCHECK` and `deploy.sh` |
| 8 | The health endpoint lived at `api/_health`. **App Router treats `_`-prefixed folders as private**, so it was never routed: the production image answered **404** while `/platform/login` answered 200. Every deploy gate built on it (Dockerfile `HEALTHCHECK`, `deploy.sh`, the new post-deploy curl) could never pass. It also returned `{db:"ok", redis:"ok"}` as literals | ran the built image and curled it | moved to `api/health`, now actually checks `select 1` and `PING` and returns 503 when either is down |

**CI evidence** (commit `46df14ae`):

- `Verify Phase 0` — https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44902507626 ✅
- `Deploy` — https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44902500218 ❌ at **step 14 of 33**, "Check deploy configuration".
  Steps 1–13 (checkout, pnpm, install, lint, build, migrate, seed, app role, RLS 8/8,
  platform 21/21) are all green. The workflow now fails **only** because the deploy
  target is unconfigured — which is the honest state, not a cached mystery.

**Blocker:** the repository has **0 Actions secrets**. `VPS_HOST`, `VPS_USER`,
`VPS_SSH_KEY` and `HEALTH_URL` are all unset, so no deploy can run. The workflow now
fails with an explicit `Deploy target is not configured. Missing repository secrets: …`
instead of a cryptic SSH error — deliberately red rather than silently skipped.

**Impact:** Prompt 4 (Super Admin UI) needs a real HTTPS deploy to verify auth cookies,
branding and rate limiting. The deploy path cannot be signed off until those secrets
and a reachable VPS exist.

### Local proof of the deploy artifact (no VPS needed)

`docker build -f apps/web/Dockerfile .` → image built (311 MB), then run against
real `postgres:16-alpine` + `redis:7-alpine` on a user network:

| Check | Result |
| --- | --- |
| `GET /api/health` (host) | **200** `{"status":"ok","db":"ok","redis":"ok"}` |
| `GET /platform/login` | **200** |
| Docker `HEALTHCHECK` | **healthy** |
| Redis stopped → health | **503** `{"status":"degraded","redis":"down"}` (the probe is not a literal any more) |
| Redis restarted → health | **200** |

What this does **not** prove: the VPS side (`deploy.sh`, compose, Caddy, TLS),
because that requires the four missing secrets. The image, the runtime bind, the
health endpoint and the probe targets are proven; the SSH/deploy step is not.

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
### Prompt 2 — Platform API core (accepted 2026-11-21)

- Commit: `3b8b2b01` (platform API) + follow-up commit (role matrix + regression tests)
- Endpoints: 12 platform API endpoints + dashboard; contract at `docs/api/platform.md`
- 21/21 platform tests green locally (15 API + 6 role guard) and 8/8 RLS
- Role matrix tightened to the approved shape: `platform_support` is **read-only**;
  every mutation (tenant create/update/suspend/reactivate/archive, modules, pricing,
  settings) is `super_admin` only. Support answers tickets; it cannot cut a clinic off.
- **Break-it for Prompt 2** — target: `requirePlatformRole`. Removed the role check so
  any authenticated platform session passed. Result: **3 of 6 red**
  (create / suspend / archive by `platform_support`), while read / 401 / super_admin
  stayed green. Restored → 21/21 green.

  | Run | Commit | Result |
  | --- | --- | --- |
  | Baseline | `f332d011` | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44896894584 ✅ 8/8 RLS + 21/21 platform + build |
  | Break-it | `ba0ea888` | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44897054712 ❌ 3/21 red (`expected 201 to be 403`, `expected 200 to be 403` ×2), RLS still 8/8, build skipped |
  | Restore | `be2476d6` + `437cbb5f` | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44897290837 ✅ all 12 steps: 8/8 RLS, 21/21 platform, build |

  The break-it failed **inside** `test:platform` with the RLS suite still green, which is
  the specificity proof: only the guard moved, nothing else did.
- Regression tests locked in: `changedFields` ignores `updatedAt`, compares `Date` by
  value, treats equal Dates as unchanged.
- Connection policy written down in `docs/architecture.md` (tenant / platform / migration
  roles), including the rule that `PLATFORM_DATABASE_URL` never appears in tenant code.
- Schema comment records why `tenant_audit_log` must not cascade from `tenants`.

### Prompt 2 — Platform API core (2026-11-21, first report)

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

### Prompt 3 — Subscription engine + tenant provisioning (CI-verified 2026-11-21)

**Verified in CI:** baseline green → break-it red → restore green, all three runs on
the `Verify Phase 0` workflow. The deploy workflow remains blocked on the four
repository secrets recorded above (separate concern; does not affect verification).

**Environment.** The project's `okramed-postgres-1` container was reachable from the
host only through a TCP proxy on port 5433 (host 5432 is a separate native PostgreSQL
instance shared with the `yene` roles; it was not modified). A fresh `okramed_verify`
database was migrated from zero and seeded. `okra_app` was created with
`NOSUPERUSER NOBYPASSRLS`; `okra` (container superuser) served as the control plane.

| Check | Result |
| --- | --- |
| `pnpm db:migrate` (0000–0006, from empty) | ✅ all applied, including `0006_phase1_composite_fk` |
| `tsc --noEmit` | ✅ clean |
| `test:rls` (`okra_app`) | ✅ 9/9 (4 guard + 5 isolation) |
| `test:platform` (owner) | ✅ 21/21 |
| `test:provisioning` (`okra_app` app / owner platform) | ✅ 7/7 |

**Break-it (local + CI).** Commented out the `set_config('app.tenant_id', …)` line in
`provisionTenant` and reran `test:provisioning`: **5 of 7 red**, including the required
Test 3 (items invisible / RLS violation) and Test 2 (failure injected before commit).
Restored the line → **7/7 green**. The break-it was then reproduced in CI (commit
`c7a58aaa`) — the `test:provisioning` step failed while `test:rls` and `test:platform`
stayed green and `build` was skipped — then restored (`52ccf504`) → all green.

**Regression fixes required by the new contract.** Prompt 2's `platform-auth` test
posted only `{slug, name, trialDays}` and read `body.data.id`. Provisioning now requires
an admin and at least one module, and returns `{tenant, subscription, adminUserId, items}`.
The test payload/response access and its fixture cleanup were updated (roles and the
subscription do not cascade from `tenants`). Assertions were not weakened — the
create-tenant test still asserts a single `201` status, and the suspend follow-up still
asserts `200` + `data.status === "suspended"`.

**Three new negative tests** added to `platform-auth.test.ts` for the changed contract:
- rejects a body missing `adminEmail` with `400` (`VALIDATION`, message mentions `adminEmail`)
- rejects a body missing `modules` with `400` (`VALIDATION`, message mentions `modules`)
- returns `409` with `TENANT_SLUG_TAKEN` on a slug collision (first request `201`, second `409`)

**No cross-test pollution.** The full suite was run twice in a row without a fresh DB
(`okramed_verify`, no re-migrate/re-seed between runs). Both runs identical and green:

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| `test:rls` (`okra_app`) | 9/9 ✅ | 9/9 ✅ |
| `test:platform` (owner) | 24/24 ✅ | 24/24 ✅ |
| `test:provisioning` (`okra_app` / owner) | 7/7 ✅ | 7/7 ✅ |

### CI runs (Verify Phase 0)

| Run | Commit | Result | URL |
| --- | --- | --- | --- |
| Baseline | `b0ca4cfe` | ✅ 9/9 RLS + 24/24 platform + 7/7 provisioning + build | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44912196964 |
| Break-it | `c7a58aaa` | ❌ provisioning red (`test:provisioning` failed), RLS 9/9 ✅, platform 24/24 ✅, build skipped | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44912502932 |
| Restore | `52ccf504` | ✅ 9/9 RLS + 24/24 platform + 7/7 provisioning + build | https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44916558840 |

The break-it failed **only** in `test:provisioning` (step 12), while `test:rls` (step 10)
and `test:platform` (step 11) stayed green and `build` (step 13) was skipped — the surgical
specificity proof: the break-it moves the provisioning tests and nothing else.

### Branch protection

`main` is protected: the `verify` check (Verify Phase 0) is a required status check
(strict — the branch must be up to date before merge). The workflow now runs on
`push` and `pull_request` to `main` (plus the existing manual `workflow_dispatch`),
so CI runs automatically on every push — confirmed by run
[44917251931](https://github.com/fuyesalah-pixel/okra-med-/actions/runs/44917251931)
(commit `8239e2e1`, all green). Force pushes and branch deletions are blocked.
`enforce_admins` is **off**: this repo pushes directly to `main` (no PR workflow),
and requiring the check on direct pushes creates a deadlock — the check cannot run
until the push lands, so the push can never land. With `enforce_admins` off the owner
retains direct-push ability; the `verify` check still **runs** on every push and
**gates PR merges**, so CI is the gate by construction without blocking the
direct-push workflow.

The `verify` trigger change landed in two commits: `fe8fe7c2` (added `push` /
`pull_request`) had a YAML typo (`workflow_dispatch` missing its colon) that made
GitHub fail to parse the file (0 jobs, immediate failure, run `44917145942`);
`8239e2e1` fixed it. Both break-it commits (`c7a58aaa`, `fe8fe7c2`'s broken run)
stay in history as evidence.
