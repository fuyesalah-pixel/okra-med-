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

- (pending)
