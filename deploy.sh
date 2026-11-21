#!/bin/bash
set -e
cd /opt/okra-med
git pull origin main

# The Docker build runs pnpm install + next build in the builder stage.
# There is no host-side build step: running pnpm on the VPS would require
# node + pnpm installed there, produce a redundant build, and add ~2 min.

# Start postgres, redis, and caddy if they aren't already running,
# then rebuild and restart only the web container.
docker compose -f docker-compose.prod.yml up -d postgres redis caddy
docker compose -f docker-compose.prod.yml up -d --no-deps --build web
docker image prune -f

# Probe from *inside* the web container. docker-compose.prod.yml publishes no port
# for `web` (Caddy reaches it over the internal network), so probing from the host
# at localhost:3000 would always fail — the port isn't published.
for i in $(seq 1 10); do
  if docker compose -f docker-compose.prod.yml exec -T web \
       wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Deploy OK"; exit 0
  fi
  sleep 3
done
echo "Deploy failed: health probe timed out"; exit 1
