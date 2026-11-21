# @okra-med/db

Drizzle schema, migrations and seed for the Okra Med database.

## Migrations

**Do not run `drizzle-kit generate` until `meta/` is regenerated.** The current
`meta/` snapshot is stale (only has `0000`); `generate` will diff against it and
try to re-emit objects that `0001_rls.sql`, `0002_rls_with_check.sql` and
`0003_phase1.sql` already own.

**To add a migration:** hand-write `NNNN_name.sql` in the same style as `0003`,
add the journal entry in `meta/_journal.json`, and run `db:migrate`.

The journal entry is the load-bearing part — `db:migrate` only runs files listed
in `meta/_journal.json`. A migration file that is not registered will silently
never run, in CI or in production.

When to fix: before Phase 3 (patient tables). Regenerate `meta/` from the live
database, then re-enable `generate`.

## RLS

Every tenant table is expected to have `ENABLE ROW LEVEL SECURITY`,
`FORCE ROW LEVEL SECURITY`, and a policy with both `USING` and `WITH CHECK` of
the form:

```sql
nullif(current_setting('app.tenant_id', true), '')::uuid
```

`apps/web/tests/rls-guard.test.ts` is the source of truth for that rule. Platform
tables without a `tenant_id` must be listed in `PLATFORM_SCOPED_TABLES` with a
written justification.
