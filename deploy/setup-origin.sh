#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN=office.pentaworks.net
APP_DIR=/home/inhwan/apps/pentaworks-intranet
CLOUDFLARE_CREDENTIALS=/etc/letsencrypt/secrets/cloudflare.ini

curl --fail --silent http://127.0.0.1:3300/login >/dev/null

docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/log/letsencrypt:/var/log/letsencrypt \
    certbot/dns-cloudflare:latest certonly --non-interactive --agree-tos \
        --dns-cloudflare --dns-cloudflare-credentials "$CLOUDFLARE_CREDENTIALS" \
        --dns-cloudflare-propagation-seconds 30 --cert-name "$DOMAIN" -d "$DOMAIN"

docker run --rm \
    -v "$APP_DIR/deploy/nginx":/source:ro \
    -v /etc/nginx/sites-available:/available \
    -v /etc/nginx/sites-enabled:/enabled \
    alpine:3.22 sh -c "cp /source/$DOMAIN.conf /available/$DOMAIN && ln -sfn /etc/nginx/sites-available/$DOMAIN /enabled/$DOMAIN"

docker run --rm --privileged -v /:/host alpine:3.22 chroot /host /usr/sbin/nginx -t
docker run --rm --privileged --pid=host -v /run:/host-run:ro alpine:3.22 \
    sh -c 'kill -HUP "$(cat /host-run/nginx.pid)"'
curl --fail --silent --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login" >/dev/null
