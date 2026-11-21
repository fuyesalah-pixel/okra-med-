#!/bin/bash
set -e
mkdir -p /backups
pg_dump "$DATABASE_URL" | gzip > "/backups/okra-$(date +%F-%H%M).sql.gz"
find /backups -name "okra-*.sql.gz" -mtime +3 -delete
echo "Backup done"
