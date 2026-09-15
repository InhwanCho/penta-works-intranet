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
