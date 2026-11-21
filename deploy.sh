#!/bin/bash
set -e
cd /opt/okra-med
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @okra-med/web build
docker compose -f docker-compose.prod.yml up -d --no-deps --build web
docker image prune -f
# Probe from *inside* the web container. docker-compose.prod.yml publishes no port
# for `web` (Caddy reaches it over the internal network), so the previous
# `curl http://localhost:3000` ran on the host and could never connect — the
# deploy would have reported failure even on a perfectly healthy container.
for i in $(seq 1 10); do
  if docker compose -f docker-compose.prod.yml exec -T web \
       wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Deploy OK"; exit 0
  fi
  sleep 3
done
echo "Deploy failed"; exit 1
