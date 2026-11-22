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

## Workflow debugging rule

When any CI/CD workflow fails, do **not** just fix the failing step and declare
victory. The workflow stops at the first failure, so every step after it is
unexercised. After fixing step N, verify that steps N+1 through the end actually
run and pass on the next push.

Rationale: in Phase 1 the `Deploy` workflow had been dying at step 3 for three
prompts, hiding ten defects behind it. Fixing step 3 exposed nine more.

Exception: when a step is blocked on a genuine external dependency (no VPS
credentials, no DNS), make it fail **loudly** rather than skip. A silent skip is
how a pipeline stays "green" for months while being fundamentally broken. That
is why `Check deploy configuration` exits non-zero when the secrets are missing.

## Rules that are not negotiable

- Never weaken an assertion to make CI green. If a test fails, find out which layer
  it exercises and fix that layer.
- Every migration is registered in `packages/db/migrations/meta/_journal.json`.
  An unregistered migration never runs. `drizzle-kit generate` stays disabled —
  see `packages/db/README.md`.
- Break-it commits stay in history. They are the evidence that a suite detects real
  faults, not just that it passes.
- Audit rows record changed **field names**, never values.


## Credential handling rules

Credentials live **only** in the specific file or service that needs them:

| Credential | Lives in |
|---|---|
| App secrets | `/opt/okra-med/.env.production` on the VPS, `chmod 600` |
| Traefik secrets (ACME email, Cloudflare token) | `/docker/traefik/.env` on the VPS, `chmod 600` |
| Deploy SSH key | `~/.ssh/okra-med-deploy` on the operator's machine |
| CI secrets | GitHub repository secrets |

**Never** put credentials in:
- Desktop, Downloads, Documents — Windows auto-syncs these to OneDrive
- Git-tracked files, even in `.gitignore`'d paths
- Chat, email, screenshots, screen shares
- Any file that persists beyond the task that needed it

If an agent or tool suggests putting a credential in an unusual location, stop and
ask: *"is this the file that actually needs it, or is this a convenience shortcut?"*

When rotating a credential, delete the old one from every location before adding
the new one. If you suspect a credential leaked, rotate immediately — do not wait.
