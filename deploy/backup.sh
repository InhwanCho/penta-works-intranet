#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR=/home/inhwan/backups/pentaworks-intranet
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

docker exec pentaworks-intranet-db sh -lc \
  'mariadb-dump --single-transaction --quick -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  | gzip > "$BACKUP_DIR/database-$STAMP.sql.gz"

docker run --rm \
  -v pentaworks_intranet_uploads:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.22 tar -czf "/backup/uploads-$STAMP.tar.gz" -C /data .

echo "Backup completed: $STAMP"
