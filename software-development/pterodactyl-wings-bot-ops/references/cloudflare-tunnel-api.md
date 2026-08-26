# Cloudflare Tunnel via REST API (validated path for this headless WSL host)

Companion to `cgnat-tunnel-and-dns01.md` §0. That file lists what FAILED on this host; this file lists
what WORKED up to the point of running `cloudflared`. Read both.

## Why API and not `cloudflared login`
This WSL host has no browser/GUI, so `cloudflared tunnel login` (interactive OAuth in a browser) cannot
run here. The Cloudflare REST API lets us register the tunnel + route DNS from the CLI. The ONLY step
that still needs a GUI machine is producing `credentials.json` to actually RUN `cloudflared` — see the
hand-off note at the bottom.

## Prereqs
- A CF **API Token** with `Account: Cloudflare Tunnel: Edit` + `Zone: DNS: Edit`
  (Account Resources: Include → All accounts). Verify: `curl -H "Authorization: Bearer $TOKEN"
  "https://api.cloudflare.com/client/v4/accounts?per_page=50"` returns `count` ≥ 1.
  (A Zone-only token returns count 0 and CANNOT create tunnels — see cgnat-tunnel §3.)
- `cloudflared` installed:
  `curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared`

## Validated sequence (all returned success:true this session)

```bash
TOKEN="<account-scoped token>"
ZONE="<zone id from CF dashboard right sidebar, or from GET zones?name=...>"

# 1. Get ACCOUNT_ID (zone endpoint carries it; accounts list may be empty-looking but this works):
ACCT=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=satzz.online" \
  | python3 -c "import sys,json;z=json.load(sys.stdin)['result'][0];print(z['account']['id'])")

# 2. Create the tunnel:
TID=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"pterodactyl-panel","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])")
# -> TID like 464252a2-32a5-4b7a-813d-cef733b6f6f5

# 3. Route DNS: change the panel/node A-record to a CNAME -> <TID>.cfargotunnel.com, proxied (orange).
#    Find the record id first, then PUT:
REC_ID=$(curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?type=A&name=panel.satzz.online" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
curl -sS -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"type\":\"CNAME\",\"name\":\"panel.satzz.online\",\"content\":\"$TID.cfargotunnel.com\",\"ttl\":1,\"proxied\":true}" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$REC_ID"
# Repeat for node.satzz.online (service http://localhost:8080).
```

## Running `cloudflared` — the remaining gap (NOT solved from WSL CLI)
The API registers the tunnel and routes DNS, but to actually run it you need a **`credentials.json`**
(`AccountTag`, `TunnelID`, `TunnelSecret`). Cloudflare never returns `tunnel_secret` via API, and the
`/cfd_tunnel/<id>/token` endpoint returns a 294-char string `cloudflared` rejects (`Provided Tunnel
token is not valid`). So `cloudflared tunnel run` cannot start from WSL alone.

**Hand-off that works:** do the one-time `login` + `create` on a GUI machine (the Windows host, which
has a browser and reaches WSL via the existing netsh portproxy), then copy the resulting
`%USERPROFILE%\.cloudflared\<TID>.json` (and `cert.pem`) into WSL at `/etc/cloudflared/`. Then:
```
# /etc/cloudflared/config.yml
tunnel: <TID>
credentials-file: /etc/cloudflared/<TID>.json
ingress:
  - hostname: panel.satzz.online
    service: https://localhost:443
    originRequest: { noTLSVerify: true }
  - hostname: node.satzz.online
    service: http://localhost:8080
  - service: http_status:404
```
Run as a systemd service (`ExecStart=/usr/local/bin/cloudflared tunnel run`, `User=root`) — do NOT use
`--token` or `TUNNEL_TOKEN` env (both failed here). Once the tunnel owns the record, DDNS for that
name is unnecessary.

**Connectivity proof:** `cloudflared tunnel run` pre-checks all PASS (DNS resolve, UDP QUIC, TCP HTTP/2
to `regionN.v2.argotunnel.com`) through this host's ISP inbound block — confirming the tunnel is the
right fix for the CGNAT/port-block situation.

## Rolling back / re-creating
To recreate cleanly: `DELETE /accounts/$ACCT/cfd_tunnel/$TID` first (returns 200), then re-POST. The
DNS CNAME can stay pointed at the new TID after recreation.
