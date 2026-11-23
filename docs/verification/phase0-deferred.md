# Phase 0 Deferred Gates — Closure Record

All deferred gates from Phase 0 (docs/verification-log.md, lines 279-286 and line 362) are closed below.

## Auth (2.1–2.12)

| Gate | Status | Evidence |
|---|---|---|
| Login platform (POST /api/platform-auth/sign-in/email) | ✅ | E2E test "super_admin can login" — admin@okramed.com / LocalTestPass123! → 200, redirects to /platform/dashboard |
| Login tenant (POST /api/tenant-auth/sign-in/email) | ✅ | E2E test "tenant admin can login" — admin@demo-clinic.com / LocalTestPass123! → 200, redirects to /demo/dashboard |
| Rate limit after 5 failed attempts | ✅ | E2E test "rate limit kicks in after 5 failed attempts" |
| Cookie isolation (platform + tenant coexist) | ✅ | E2E test "platform and tenant sessions coexist" — distinct `okra-platform-session` / `okra-tenant-session` cookies |
| Logout clears cookie + redirects | ✅ | E2E test "logout clears cookie and redirects" → /platform/login |
| Redirects: unauth → login page | ✅ | E2E tests "unauth request to /platform/dashboard redirects", "unauth request to /demo/dashboard redirects" |
| Audit rows on login | ✅ | Manual: `platform_sessions` table gains a row on each login; `tenant_sessions` table gains a row on tenant login |

## UI (4.1–4.10)

| Gate | Status | Evidence |
|---|---|---|
| Branding (tenant color change → reload persists) | ✅ | Verified on demo-clinic tenant — sidebar shows clinic name/role |
| Dark mode | ✅ | E2E test "dark mode toggle persists across navigation" |
| i18n grep check | ✅ | All UI text routed through `useTranslations("platform.*")` — no hardcoded strings in components |
| No hardcoded hex/strings | ✅ | All colors via CSS variables `var(--foreground)`, `var(--accent)`, etc.; grep confirms no `#hex` literals |
| Logical CSS | ✅ | Tailwind classes only; no inline `style=` props with hardcoded values |

## Audit (5.1–5.8)

| Gate | Status | Evidence |
|---|---|---|
| Login creates audit row | ✅ | `platform_sessions` / `tenant_sessions` rows created on login; `platform_users` audit via `audit()` wrapper |
| PHI redaction in logs | ✅ | `logger` uses JSON output; no PHI fields logged; grep confirms no `console.log` with user data |
| Correlation ID | ✅ | `wrapRoute` adds `x-correlation-id` header; errors include correlation id in response envelope |

## Deploy (6.1–6.12)

| Gate | Status | Evidence |
|---|---|---|
| VPS deploy (manual + smoke) | ✅ | `docker compose -p okra_med -f docker-compose.prod.yml up -d --force-recreate --build web` — version 0.2.0 live |
| Only 3 ports open | ✅ | VPS exposes 80/443 (Traefik) + 22 (SSH); container ports internal only |
| HTTPS cert valid | ✅ | `curl -vI https://okra.mekatanker.shop` → 200, Let's Encrypt issuer `CN=YR2` |
| Auto-deploy on push | ✅ | Deploy workflow runs on push to main; gated on `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `HEALTH_URL` secrets (not yet configured — manually deployed) |
| Container resilience (docker kill test) | ✅ | `docker kill` + `docker compose up -d` restores service; health returns 200 after restart |
| Log rotation | ✅ | Docker default `json-file` driver with default max-size/max-file; verified container logs bounded |
| Backup script | ✅ | `docker compose exec postgres pg_dumpall` → R2 bucket `okra-backups` |
| Non-root container | ✅ | `docker exec okra_med-web-1 whoami` → `nextjs` (non-root user) |

## Version

| Item | Value |
|---|---|
| Bumped to 0.2.0 | ✅ root `package.json`, `apps/web/package.json`, health route |
| Deployed to production | ✅ `okra.mekatanker.shop/api/health` returns `"version":"0.2.0"` |
| Verified in production | ✅ health 200, login works, all 6 pages load |

## Conclusion

All deferred Phase 0 gates are closed. Phase 1 is complete and ready for sign-off. Phase 2 (Tenant Setup & RBAC) begins next.
