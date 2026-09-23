#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=/home/inhwan/apps/pentaworks-intranet
ENV_FILE=/home/inhwan/pentaworks-secrets/intranet.env
REPOSITORY_URL=https://github.com/InhwanCho/penta-works-intranet.git

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing environment file: $ENV_FILE" >&2
    exit 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
    existing_compose="$APP_DIR/docker-compose.yml"
    if [[ -f "$existing_compose" ]]; then
        docker compose --env-file "$ENV_FILE" -f "$existing_compose" down
    fi
    find "$APP_DIR" -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf -- {} +
    git clone --branch main --single-branch "$REPOSITORY_URL" "$APP_DIR"
else
    git -C "$APP_DIR" fetch origin main
    git -C "$APP_DIR" checkout main
    git -C "$APP_DIR" merge --ff-only origin/main
fi

cd "$APP_DIR"
compose=(docker compose --project-name pentaworks-intranet --env-file "$ENV_FILE")
if docker ps --format '{{.Names}}' | grep -qx 'pentaworks-intranet-db'; then
    bash deploy/backup.sh
fi
"${compose[@]}" up -d database
for attempt_no in $(seq 1 30); do
    if docker exec pentaworks-intranet-db healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
docker exec pentaworks-intranet-db sh -lc \
  'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"'
service_schema_applied=$(docker exec pentaworks-intranet-db sh -lc \
  'mariadb -Nse "SELECT COUNT(*) FROM schema_migrations WHERE version=\"002_service_schema\"" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"')
if [[ "$service_schema_applied" != "1" ]]; then
    docker exec -i pentaworks-intranet-db sh -lc \
      'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
      < database/init/002_service_schema.sql
fi
remove_manufacturing_applied=$(docker exec pentaworks-intranet-db sh -lc \
  'mariadb -Nse "SELECT COUNT(*) FROM schema_migrations WHERE version=\"003_remove_manufacturing_fields\"" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"')
if [[ "$remove_manufacturing_applied" != "1" ]]; then
    docker exec -i pentaworks-intranet-db sh -lc \
      'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
      < database/init/003_remove_manufacturing_fields.sql
fi
accounting_role_applied=$(docker exec pentaworks-intranet-db sh -lc \
  'mariadb -Nse "SELECT COUNT(*) FROM schema_migrations WHERE version=\"004_accounting_role\"" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"')
if [[ "$accounting_role_applied" != "1" ]]; then
    docker exec -i pentaworks-intranet-db sh -lc \
      'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
      < database/init/004_accounting_role.sql
fi
"${compose[@]}" build backend frontend
"${compose[@]}" up -d --remove-orphans

for attempt_no in $(seq 1 45); do
    if curl --fail --silent http://127.0.0.1:8280/actuator/health >/dev/null \
        && curl --fail --silent http://127.0.0.1:3300/login >/dev/null; then
        "${compose[@]}" ps
        exit 0
    fi
    sleep 2
done

"${compose[@]}" ps
"${compose[@]}" logs --tail=150 backend frontend
exit 1
