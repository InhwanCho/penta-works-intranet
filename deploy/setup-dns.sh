#!/usr/bin/env bash
set -Eeuo pipefail

CLOUDFLARE_CREDENTIALS=/etc/letsencrypt/secrets/cloudflare.ini

docker run --rm \
  -v "$CLOUDFLARE_CREDENTIALS":/run/secrets/cloudflare.ini:ro \
  alpine:3.22 sh -eu -c '
    apk add --no-cache curl jq >/dev/null
    token=$(sed -n "s/^[[:space:]]*dns_cloudflare_api_token[[:space:]]*=[[:space:]]*//p" /run/secrets/cloudflare.ini)
    test -n "$token"
    api=https://api.cloudflare.com/client/v4
    zone_id=$(curl -fsS -H "Authorization: Bearer $token" "$api/zones?name=pentaworks.net" | jq -er ".result[0].id")
    origin_ip=$(curl -fsS -H "Authorization: Bearer $token" "$api/zones/$zone_id/dns_records?name=pentaworks.net&type=A" | jq -er "if (.result | length) == 1 then .result[0].content else error(\"Expected one origin A record\") end")
    record_id=$(curl -fsS -H "Authorization: Bearer $token" "$api/zones/$zone_id/dns_records?name=office.pentaworks.net" | jq -er "[.result[] | select(.type == \"A\" or .type == \"CNAME\")] | if length <= 1 then .[0].id // \"\" else error(\"Multiple Office DNS records\") end")
    payload=$(jq -nc --arg ip "$origin_ip" "{type:\"A\",name:\"office.pentaworks.net\",content:\$ip,ttl:300,proxied:false}")
    if test -n "$record_id"; then
      result=$(curl -fsS -X PUT -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$payload" "$api/zones/$zone_id/dns_records/$record_id")
    else
      result=$(curl -fsS -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$payload" "$api/zones/$zone_id/dns_records")
    fi
    echo "$result" | jq -e ".success == true" >/dev/null
  '

echo "Cloudflare DNS is ready: office.pentaworks.net"
