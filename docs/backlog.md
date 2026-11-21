# Backlog

Deferred work that must not be forgotten. Every item names the gate it blocks.

## Phase 5 gate

- **`PLATFORM_DATABASE_URL` must be distinct from `DATABASE_URL` in production.**
  The platform control plane (`/api/platform/*`) reads across tenants and therefore
  needs a role with `BYPASSRLS` (`okra_platform`). Development falls back to
  `DATABASE_URL`, which is the tenant role — acceptable on a single-tenant-owned
  box today, **not** acceptable once real tenants share the deployment. Add the
  variable to `.env.example` now so the next engineer sees it exists; provisioning
  the distinct role is a Phase 5 exit criterion.
