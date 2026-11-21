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

## Before first real customer (domain migration)

- **Migrate off `okra.mekatanker.shop` to a dedicated domain before onboarding
  any real hospital customer.**
  Phase 1 deploy uses `okra.mekatanker.shop` for speed (DNS infrastructure
  already exists, no domain purchase needed). This couples okra-med's public
  identity to the mekatanker brand, which is not appropriate for production use.
  Migration steps (~30 min, zero user impact if done before real customers):
  1. Add A record for `okramed.com` (or chosen domain) → `191.215.39.105`
  2. Update Traefik label in `docker-compose.prod.yml`:
     `traefik.http.routers.okra-web.rule=Host(\`okramed.com\`)`
  3. Update `.env.production`:
     `NEXT_PUBLIC_APP_URL=https://okramed.com`
     `BETTER_AUTH_URL=https://okramed.com`
  4. Update `HEALTH_URL` GitHub secret to `https://okramed.com/api/health`
  5. `git push origin main` → deploy workflow runs → verify green
  Traefik will obtain a new Let's Encrypt cert for the new domain automatically.
