# Cloudflare Tunnel Public Hostname Registration

## Problem
Adding a CNAME record `sub.domain.com → <tunnel-id>.cfargotunnel.com` in Cloudflare DNS will resolve correctly, but the tunnel returns HTTP 404 because the hostname isn't registered with the tunnel itself.

The ingress rules in `/etc/cloudflared/config.yml` are only for local routing validation, not for registering new hostnames with Cloudflare's edge.

## Solution

### Option A: Dashboard Method (User)
1. Delete any manual CNAME record for `<sub>.saturia.codes` (if exists)
2. Cloudflare Zero Trust → Networks → Tunnels
3. Select your tunnel → **Public Hostnames** tab
4. **Add a public hostname**:
   - **Subdomain:** `omniroute`
   - **Domain:** `saturia.codes`
   - **Service Type:** `HTTP`
   - **URL:** `localhost:20129`
5. Save → Cloudflare creates the CNAME AND registers it with the tunnel

### Option B: API Token Method (Automatable)
Requirements:
- `CLOUDFLARE_API_TOKEN` with scopes: `Zone DNS:Edit` + `Cloudflare Tunnel:Edit`
- Zone ID for `saturia.codes`

```bash
TOKEN="<cf-api-token>"
ZONE="saturia.codes"
TUNNEL_ID="a9521ff9-c74b-422a-a900-6fee7294aa2a"

# Get zone ID
ZONE_ID=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=$ZONE" | jq -r '.result[0].id')

# Create CNAME record
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"name\":\"omniroute.saturia.codes\",\"content\":\"$TUNNEL_ID.cfargotunnel.com\",\"proxied\":true,\"ttl\":1}"
```

## Verification
```bash
# DNS check
dig +short omniroute.saturia.codes CNAME
# Expected: tunnel-id.cfargotunnel.com

# HTTPS check  
curl -I https://omniroute.saturia.codes
# Expected: HTTP/2 307 (Next.js) or 200
```

## Common Error: HTTP 404
If you see HTTP 404 after setting up DNS:
- Hostname not registered with tunnel (missing public hostname in Zero Trust)
- Config.yml ingress not applied (restart tunnel)
- Local server not listening on the port

## Note
With a `CLOUDFLARE_TUNNEL_TOKEN` (run token, starts with `cfut_`), you CANNOT create public hostnames. It can only run the tunnel. You need a separate API token with edit permissions.