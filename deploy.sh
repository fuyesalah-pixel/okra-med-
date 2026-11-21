#!/bin/bash
set -e
cd /opt/okra-med
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @okra-med/web build
docker compose -f docker-compose.prod.yml up -d --no-deps --build web
docker image prune -f
for i in $(seq 1 10); do
  if curl -sf http://localhost:3000/api/_health >/dev/null; then echo "Deploy OK"; exit 0; fi
  sleep 3
done
echo "Deploy failed"; exit 1
