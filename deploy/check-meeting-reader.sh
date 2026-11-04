#!/usr/bin/env bash
set -Eeuo pipefail
ENV_FILE=${1:?environment file required}
# Credentials stay inside the container; never echo them or use command tracing.
network=$(sed -n 's/^MREYES_DATABASE_NETWORK=//p' "$ENV_FILE" | tail -1)
network=${MREYES_DATABASE_NETWORK:-${network:-pentaworks_default}}
docker run --rm --network "$network" --env-file "$ENV_FILE" mariadb:10.11 sh -ec '
  endpoint=${MREYES_MEETINGS_DB_URL#jdbc:mariadb://}
  server=${endpoint%%/*}
  host=${server%%:*}
  port=${server##*:}
  [ "$port" != "$server" ] || port=3306
  database=${endpoint#*/}
  database=${database%%\?*}
  export MYSQL_PWD=$MREYES_MEETINGS_DB_PASSWORD
  mariadb --connect-timeout=5 -h "$host" -P "$port" -u "$MREYES_MEETINGS_DB_USERNAME" "$database" -e "SELECT COUNT(*) AS mreyes_meetings FROM office_meeting_read"
'
