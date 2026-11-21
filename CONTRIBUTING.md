# Contributing

## Pre-push checklist

Run these before every push to `main`. Step 2 is **not optional**.

```bash
# 1. Types (fast)
pnpm --filter @okra-med/web exec tsc --noEmit

# 2. Next.js build — catches RouteContext / PageProps / LayoutProps errors
pnpm --filter @okra-med/web exec next build

# 3. Lint
pnpm lint

# 4. Tests (needs the verification database, see below)
DATABASE_URL=postgresql://okra_app:okra_app@localhost:55432/okramed pnpm test:rls
DATABASE_URL=postgresql://okra:okra@localhost:55432/okramed pnpm test:platform
```

**Why step 2 exists:** `tsc --noEmit` does not see the types Next.js *generates*
at build time (`RouteContext`, `PageProps`, `LayoutProps`). A green `tsc` with a red
`next build` means a route-handler signature is wrong — and you want to learn that
in 40 seconds locally, not 4 minutes into CI. This happened once: `wrapRoute`
declared its second argument optional while Next requires it.

On Windows, `next build` finishes compile + type-check and then fails while copying
standalone output (`EPERM: symlink`). That failure is expected locally; the Linux
CI build is authoritative.

## Local database

```bash
docker run -d --name okramed-verify -p 55432:5432 \
  -e POSTGRES_USER=okra -e POSTGRES_PASSWORD=okra -e POSTGRES_DB=okramed \
  postgres:16-alpine
DATABASE_URL=postgresql://okra:okra@localhost:55432/okramed pnpm db:migrate
DATABASE_URL=postgresql://okra:okra@localhost:55432/okramed pnpm db:seed
```

The RLS suite **must** connect as a non-superuser, or it asserts nothing:

```sql
CREATE ROLE okra_app LOGIN PASSWORD 'okra_app';
GRANT USAGE ON SCHEMA public TO okra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO okra_app;
```

## Rules that are not negotiable

- Never weaken an assertion to make CI green. If a test fails, find out which layer
  it exercises and fix that layer.
- Every migration is registered in `packages/db/migrations/meta/_journal.json`.
  An unregistered migration never runs. `drizzle-kit generate` stays disabled —
  see `packages/db/README.md`.
- Break-it commits stay in history. They are the evidence that a suite detects real
  faults, not just that it passes.
- Audit rows record changed **field names**, never values.
