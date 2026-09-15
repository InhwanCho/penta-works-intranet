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
    record_id=$(curl -fsS -H "Authorization: Bearer $token" "$api/zones/$zone_id/dns_records?name=office.pentaworks.net" | jq -r ".result[0].id // empty")
    payload=$(jq -nc "{type:\"CNAME\",name:\"office\",content:\"pentaworks.net\",ttl:1,proxied:true}")
    if test -n "$record_id"; then
      result=$(curl -fsS -X PUT -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$payload" "$api/zones/$zone_id/dns_records/$record_id")
    else
      result=$(curl -fsS -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$payload" "$api/zones/$zone_id/dns_records")
    fi
    echo "$result" | jq -e ".success == true" >/dev/null
  '

echo "Cloudflare DNS is ready: office.pentaworks.net"
