#!/usr/bin/env bash
# cf-ddns.sh — keep Cloudflare A-records for panel/node in sync with the current public IP.
# Designed to run from cron every minute. No-ops when the public IP is unchanged.
#
# SETUP (once, as root):
#   1. Cloudflare → My Profile → API Tokens → Create Token
#        Template: "Edit zone DNS"
#        Zone Resources: Include → <your domain, e.g. saturia.codes>
#        Copy the token.
#   2. Cloudflare → select the domain → right-hand sidebar "Zone ID" → copy it.
#   3. Fill the 3 vars below, then:
#        sudo install -m 755 cf-ddns.sh /usr/local/bin/cf-ddns.sh
#        echo '* * * * * /usr/local/bin/cf-ddns.sh' | sudo tee /etc/cron.d/cf-ddns
#
# Works for any grey-cloud (DNS-only) A-record behind a dynamic home/WSL public IP.
set -euo pipefail

CF_TOKEN="REPLACE_WITH_API_TOKEN"
CF_ZONE_ID="REPLACE_WITH_ZONE_ID"
DOMAIN="saturia.codes"
SUBDOMAINS=("panel" "node")   # A-records to keep pointed at the current public IP

CACHE_DIR="/var/cache/cf-ddns"
mkdir -p "$CACHE_DIR"
LAST_IP_FILE="$CACHE_DIR/last_ip"

log() { echo "[$(date '+%H:%M')] $*"; }

CURRENT_IP="$(curl -sS -m 10 https://api.ipify.org || true)"
if [ -z "$CURRENT_IP" ]; then
  log "Could not determine public IP; skipping this run."
  exit 0
fi

if [ -f "$LAST_IP_FILE" ] && [ "$(cat "$LAST_IP_FILE")" = "$CURRENT_IP" ]; then
  exit 0   # unchanged — do nothing (keeps Cloudflare API calls minimal)
fi

for SUB in "${SUBDOMAINS[@]}"; do
  NAME="$SUB.$DOMAIN"
  RESP="$(curl -sS -m 15 -X GET \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?type=A&name=$NAME" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json")"
  REC_ID="$(printf '%s' "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
  if [ -z "$REC_ID" ]; then
    log "No A record found for $NAME; skipping."
    continue
  fi
  curl -sS -m 15 -X PUT \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$REC_ID" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$CURRENT_IP\",\"ttl\":60,\"proxied\":false}" \
    > /dev/null
  log "Updated $NAME -> $CURRENT_IP"
done

echo "$CURRENT_IP" > "$LAST_IP_FILE"
