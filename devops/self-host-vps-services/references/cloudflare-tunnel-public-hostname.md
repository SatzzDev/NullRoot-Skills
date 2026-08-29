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
   - **Subdomain:** `panel`
   - **Domain:** `saturia.codes`
   - **Service Type:** `HTTP`
   - **URL:** `127.0.0.1:8088`
5. Save → Cloudflare creates the CNAME AND registers it with the tunnel

### Option B: CLI Method (requires `cert.pem`)
```bash
# Get cert.pem from cloudflared tunnel login (browser flow, stores in ~/.cloudflared/cert.pem)
cloudflared --origincert ~/.cloudflared/cert.pem tunnel route dns <tunnel-id> <hostname>
```
**Caveat:** `cloudflared tunnel login` requires opening a browser (interactive, can't be automated on a headless VPS). The cert is user-specific (per-tunnel). On the saturia VPS, the cert was obtained once via `cloudflared tunnel login` from the user's desktop and stored at `/home/saturia/.cloudflared/cert.pem`.

### Option C: API Token Method (Automatable)
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
  --data "{\"type\":\"CNAME\",\"name\":\"panel.saturia.codes\",\"content\":\"$TUNNEL_ID.cfargotunnel.com\",\"proxied\":true,\"ttl\":1}"
```

## Verification
```bash
# DNS check
dig +short panel.saturia.codes CNAME
# Expected: tunnel-id.cfargotunnel.com

# HTTPS check  
curl -I https://panel.saturia.codes
# Expected: HTTP/2 200 (Laravel)
```

## Common Error: HTTP 404
If you see HTTP 404 after setting up DNS:
- Hostname not registered with tunnel (missing public hostname in Zero Trust)
- Config.yml ingress not applied (restart tunnel)
- Local server not listening on the port

## Remotely-managed tunnel gotcha
The saturia VPS tunnel (`a9521ff9-c74b-422a-a900-6fee7294aa2a`) is **remotely-managed** — config is pushed from Cloudflare's API to the edge, NOT read from `/etc/cloudflared/config.yml`. 

This means:
- Editing the local `config.yml` adds routes that are validated locally but **not pushed** to the edge.
- You MUST add hostnames via the dashboard (Option A) or `cloudflared tunnel route dns` (which calls the API).
- Local `config.yml` edits are NOT sufficient to register new hostnames.

## CF token types on the VPS
- `/etc/cloudflared/tunnel-token` — RUN-TOKEN (JWT, body `{"a":..,"t":<tunnel-id>}`) — NOT a `cfut_` API token. Can only run the tunnel.
- `/etc/cloudflared/.cf_token` — `cfut_` tunnel token — same as run-token, cannot do DNS/API edits.
- `/home/saturia/.hermes/mcp-tokens/cloudflare.json` — MCP OAuth token (format `id:secret:extra`) — NOT a CF API token.
- **No standard `CLOUDFLARE_API_TOKEN` exists on the VPS.** All `cloudflared tunnel route dns` attempts fail with "Cannot determine default origin certificate path" or "Error decoding origin cert: missing token in the certificate" because the Origin CA cert is absent.
- **Workaround:** Run `cloudflared tunnel login` from a machine with a browser to get `cert.pem`, OR ask the user to add hostnames via the CF dashboard.

## Note
With a `CLOUDFLARE_TUNNEL_TOKEN` (run token, starts with `cfut_`), you CANNOT create public hostnames. It can only run the tunnel. You need a separate API token with edit permissions.
