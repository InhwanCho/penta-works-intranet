#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN=office.pentaworks.net
APP_DIR=/home/inhwan/apps/pentaworks-intranet
CLOUDFLARE_CREDENTIALS=/etc/letsencrypt/secrets/cloudflare.ini

if [[ $EUID -ne 0 ]]; then echo "Run with sudo." >&2; exit 1; fi
curl --fail --silent http://127.0.0.1:3300/login >/dev/null

certbot certonly --non-interactive --agree-tos \
    --dns-cloudflare --dns-cloudflare-credentials "$CLOUDFLARE_CREDENTIALS" \
    --dns-cloudflare-propagation-seconds 30 --cert-name "$DOMAIN" -d "$DOMAIN"

install -m 644 "$APP_DIR/deploy/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sfn "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx
curl --fail --silent --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login" >/dev/null
