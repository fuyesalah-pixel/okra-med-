# Okra Med

Multi-tenant hospital/clinic management SaaS.

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Run `pnpm install`.
3. Run `docker compose up -d postgres redis`.
4. Run `pnpm db:migrate` then `pnpm db:seed`.
5. Run `pnpm dev`.

## Deploy

See `deploy.sh` and GitHub Actions workflow.
