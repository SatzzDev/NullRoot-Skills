# CGNAT, Cloudflare Tunnel, certbot DNS-01, and CF token gotchas (validated session)

Companion to `dns-stale-diagnosis.md`. Covers the cases where DNS + cert + UFW are all correct
but the panel STILL can't be reached from the internet, plus the TLS-cert recipe that needs no
open port, and the CF API token pitfalls this host hit.

## 0. CRITICAL — this host's tunnel path is API-driven, NOT `cloudflared login`
The recipe at the bottom of §1 (`cloudflared tunnel login` → `create` → `route dns`) needs an
**interactive browser** to authorize. This WSL host is headless — `login` is impossible here.
**Failed attempts that a future session must NOT repeat** (all hit this session):
- `cloudflared tunnel run --token <raw-token>` → `Incorrect Usage. flag provided but not defined: -token`
  (the `run` subcommand does NOT take `--token`).
- `cloudflared tunnel run` with `TUNNEL_TOKEN` env / systemd `EnvironmentFile` + `--token ${VAR}` →
  `Provided Tunnel token is not valid`. The token returned by `GET /accounts/<acct>/cfd_tunnel/<id>/token`
  (a 294-char string) is NOT a format `cloudflared` accepts. Cloudflare never returns `tunnel_secret`
  via API GET, so you cannot build a `credentials.json` from the API either.
- `systemd` does NOT expand `${VAR}` in `ExecStart` from `EnvironmentFile` for `cloudflared` — service
  stays `inactive` and logs show the help text.
**Working path (validated as far as tunnel registration + DNS routing):** create the tunnel via the
**Cloudflare REST API** with an *Account-scoped* token, then CNAME the DNS record to the tunnel.
See `references/cloudflare-tunnel-api.md` for the exact, copy-paste sequence. The one remaining gap:
running `cloudflared` needs either `credentials.json` (from a browser `login`/`create` on a GUI machine)
or a Windows-host-side `cloudflared` install that does the `login` once and copies the json back. Plan
for that hand-off rather than looping on the WSL CLI.

## 0b. RUNNING the tunnel with a valid cert already on-disk (validated, no browser needed)
`cloudflared login` is impossible on headless WSL (§0 says so). But if a `cert.pem` already
exists at `~/.cloudflared/cert.pem` (left by a prior `login` on a GUI box, or copied over), you
can create + run a tunnel from the CLI entirely. Validated this session:

```bash
# cert.pem already present => create a tunnel + credentials.json WITHOUT browser
cloudflared tunnel create ptero-prod      # prints: credentials written to ~/.cloudflared/<uuid>.json
# point DNS (CNAME) to it, then run:
cloudflared tunnel --config /etc/cloudflared/config.yml run
```
Config:
```yaml
tunnel: <uuid-from-create-output>
credentials-file: /root/.cloudflared/<uuid>.json   # NOT a raw token file
ingress:
  - hostname: panel.<domain>
    service: https://127.0.0.1:443
    originRequest: { noTLSVerify: true }          # panel cert is local-origin
  - hostname: node.<domain>
    service: http://localhost:8080               # Wings daemon, plain HTTP behind tunnel TLS
  - service: http_status:404
```
**Pitfall (this session):** `GET /accounts/<acct>/cfd_tunnel/<id>/token` returns a ~294-char
string. Do NOT write that into `--token-file` and do NOT use `cloudflared ... --token-file f`.
Neither `--token-file` (flag not defined in 2026.x) nor the raw token string is accepted by
`cloudflared tunnel run`. Always go via `credentials-file: <uuid>.json` + `tunnel: <uuid>`.
## 1. CGNAT: when router port-forwarding can't possibly work
After fixing DNS (DDNS to current `api.ipify.org` IP), issuing the cert, and `ufw allow 443`,
the site may STILL time out from outside. The missing check:
```bash
PUB=$(curl -sS -m 10 https://api.ipify.org)
ip -4 addr | grep -E "$PUB" && echo "PUB IP ON INTERFACE" || echo "PUB IP NOT ON INTERFACE -> behind NAT/CGNAT"
```
If "NOT ON INTERFACE": that `125.165.x` / `125.162.x` (common Indonesian ISP) address is a CGNAT
IP owned by the ISP, NOT routed to this host. **Evidence from this host:** public IP
`125.165.107.137` was absent from every interface (`192.168.183.125` was the LAN IP, gateway
`192.168.176.1`); nginx listened on `0.0.0.0:443`; UFW allowed 443; yet external curl to
`panel.<domain>:443` AND to the raw public IP both timed out. Conclusion: there is no public IP
to forward to — router port-forward is futile.

Real options:
- **Ask the ISP for a public/static IP** (often paid), then DDNS + port-forward works.
- **Cloudflare Tunnel (recommended):** `cloudflared` opens an *outbound* connection to Cloudflare's
  edge, so no inbound port is needed and CGNAT is irrelevant. Recipe:
  ```bash
  curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared
  cloudflared tunnel login
  cloudflared tunnel create ptero-panel
  cloudflared tunnel route dns ptero-panel panel.<domain>   # DNS becomes orange/proxied, owned by tunnel
  # ~/.cloudflared/config.yml:
  #   tunnel: <id>
  #   credentials-file: /root/.cloudflared/<id>.json
  #   ingress:
  #     - hostname: panel.<domain>
  #       service: https://127.0.0.1:443
  #     - service: http_status:404
  cloudflared tunnel run ptero-panel   # or as a systemd service
  ```
  Keep nginx on 443 on-loopback; Cloudflare reaches it through the tunnel. Once the tunnel owns
  the record, DDNS for that name is unnecessary.

## 2. TLS cert when port 80/443 are unreachable — certbot DNS-01 (validated)
`certbot` http-01 needs inbound :80. Use DNS-01 with Cloudflare API hooks — no open port required.
This host issued `panel.satzz.online` this way successfully.
```bash
# /usr/local/bin/cf-auth-hook.sh  (chmod 700, root)
#!/usr/bin/env bash
set -euo pipefail
CF_TOKEN="<token scoped 'Edit zone DNS'>"   # same token cf-ddns.sh uses
ZONE_ID="<zone id>"
REC=$(curl -sS -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"type\":\"TXT\",\"name\":\"_acme-challenge.$CERTBOT_DOMAIN\",\"content\":\"$CERTBOT_VALIDATION\",\"ttl\":60}" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records")
RID=$(echo "$REC" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])")
echo "$RID" > "/tmp/cf-acme-$CERTBOT_DOMAIN.rid"; sleep 20
# /usr/local/bin/cf-cleanup-hook.sh deletes the TXT via the saved RID:
#   curl -sS -X DELETE -H "Authorization: Bearer $CF_TOKEN" \
#     "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$(cat /tmp/cf-acme-$CERTBOT_DOMAIN.rid)"
sudo certbot certonly --manual --preferred-challenges=dns \
  --manual-auth-hook /usr/local/bin/cf-auth-hook.sh \
  --manual-cleanup-hook /usr/local/bin/cf-cleanup-hook.sh \
  -d panel.<domain> --non-interactive --agree-tos --email admin@<domain>
```
Cert lands at `/etc/letsencrypt/live/panel.<domain>/`. Point the nginx vhost `ssl_certificate` /
`ssl_certificate_key` at it, then `sudo nginx -t && sudo systemctl reload nginx`.

## 3. CF API token gotchas (learned the hard way — EXPANDED)
- A token from the WRONG Cloudflare account/zone fails with `403 Invalid access token` or
  `404 ... perhaps your object identifier is invalid` (zone not visible to the token). Always
  verify first:
  `curl -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones?name=<domain>"`
  -> `success:true` and the zone listed. This session: token `cfut_...` was valid but only saw
  zone `satzz.online`, NOT `saturia.codes` (different account), so we built everything on
  `panel.satzz.online` instead. Confirm the token's visible zone matches the target domain
  BEFORE writing records.
- **Token prefix reality (this host, repeated):**
  - `cfk_*` tokens the user pasted were ALL `401 Invalid API Token` (3 different ones) — likely
    copy-truncation or already-revoked. Treat any `cfk_` paste as suspect; re-verify before use.
  - `cfut_*` tokens were VALID but only Zone-scoped (`accounts` list returned count 0). They can
    do DNS but CANNOT see accounts or create tunnels.
  - To create a Tunnel you NEED `Account: Cloudflare Tunnel: Edit`. A token with only `Zone: DNS: Edit`
    returns empty `accounts` and cannot call `cfd_tunnel`. The correct create-token summary reads:
    `All accounts - Cloudflare Tunnel:Edit` + `All zones - DNS:Edit`. Build it via
    **API Tokens → Create Token → Use custom token**, add both permissions, and set
    **Account Resources: Include → All accounts** (this is the field that was missing on the
    zone-only tokens).
- **Global API Key is DEPRECATED** (Cloudflare changelog 2026-03-19: Service/Global Key auth stops
  2026-09-30). Do NOT ask the user for it; use a scoped API Token. The user linked the deprecation
  notice themselves. Prefer the scoped token over Global Key regardless.
- DDNS / auth-hook scripts hold the token in plaintext — `chmod 700` and root-owned; rotate the
  token after the setup session.
- **HTTP 530 from Cloudflare on a tunnel hostname means the tunnel isn't connected / DNS isn't a
  CNAME to the tunnel.** Fix: set the record to CNAME `<tunnel-id>.cfargotunnel.com`, `proxied:true`
  (orange). An A-record to the home IP will 530 because the edge can't reach the (blocked/CGNAT) origin.
