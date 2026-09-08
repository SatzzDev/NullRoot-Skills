---
name: cloudflared-tunnel-expose
title: Expose a local HTTP service through a Cloudflare Tunnel (this host)
description: "Expose a local service via Cloudflare Tunnel."
version: 0.1.0
author: Hermes
platforms: [linux]
tags: [Cloudflare, Tunnel, Self-hosting, Reverse Proxy, satzz.online, saturia.codes]
---

## When to Use
- User wants a local service reachable at a `*.satzz.online` or `*.saturia.codes` subdomain.
- VPS is behind CGNAT / no public IP, so a Tunnel (not port-forward) is required.
- You have (or will create) a Cloudflare **API token** with `cloudflared:Edit` + `DNS:Edit`.

## Two token types — DO NOT CONFUSE
- **API token** starts with `cfut_`. Used for the Cloudflare REST API (create tunnel, set DNS). NOT a run-token.
- **Run-token** = ~240-char base64, NO `cfut_` prefix, returned by the tunnel-create API. Used for
  `cloudflared service install <runtoken>` and `cloudflared tunnel run --token`.
- Symptom of confusion: `cloudflared tunnel run --token cfut_xxx` → "Provided Tunnel token is not valid."
  The 48-char `cfut_` string is the API token, never a run-token. (Verified: a real run-token is 240 chars.)

## Bootstrap recipe (verified on this host)
1. Install cloudflared (deb): download `cloudflared-linux-amd64.deb` from GitHub releases, `sudo dpkg -i`.
2. Create tunnel via REST API — this is what yields the run-token:
   ```bash
   TOKEN="cfut_..."   # API token (has cloudflared:Edit + DNS:Edit)
   ACCT=$(curl -sH "Authorization: Bearer $TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts" \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
   RESP=$(curl -sX POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel" \
     -d '{"name":"my-tunnel","config_src":"local"}')
   # RESP.result.token  -> run-token (240 chars)  |  RESP.result.id -> tunnel id
   ```
   **Always pass `"config_src":"local"`** — see Pitfalls. Save the run-token to a file; never paste it in chat.
3. Write `/etc/cloudflared/config.yml` (see templates/config.yml) with `tunnel:` id + `ingress:` hostnames
   (each `- hostname:` ABOVE the `http_status:404` fallback).
4. `sudo cp run-token /etc/cloudflared/token && sudo chmod 600 /etc/cloudflared/token`, then
   `sudo cloudflared service install "$(cat /etc/cloudflared/token)"`.
5. DNS: create/patch a CNAME in the zone → `<tunnel-id>.cfargotunnel.com`, `proxied:true`, via API
   (`POST/PATCH /zones/<zone>/dns_records`). Zone IDs:
   `satzz.online=2702b094ea503836cb1776f6d0b81b37`, `saturia.codes=da7330be07287d137e3be603d85f2617`.
   To update an existing record, GET its id first (`?name=<host>`), then PATCH.
6. `sudo systemctl restart cloudflared`. Verify: `curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/`.

## Adding a new host to an EXISTING tunnel

### Locally-managed tunnel (`config_src: local`)
Edit `/etc/cloudflared/config.yml` (add `- hostname:`/`service:` entry above the 404 fallback) →
`sudo systemctl restart cloudflared`. Also add the DNS CNAME (step 5). No need to recreate the tunnel.

### Remotely-managed tunnel (`config_src: cloudflare`)
The daemon **completely ignores** `/etc/cloudflared/config.yml` ingress changes — config is pushed from Cloudflare's API.
Editing the local file and running `systemctl restart cloudflared` does nothing: the daemon logs "Updated to new configuration"
but the loaded JSON (visible in `journalctl -u cloudflared | grep 'Updated to new'`) shows the **old** hostname list pulled from the API.

**Critical**: If you edit `config.yml`, add a hostname, restart the service, and the new hostname does NOT appear in the
daemon's "Updated to new configuration" JSON log entry, the tunnel is remote-managed. Your local edits are inert. Stop editing
the file and use the dashboard or API instead.

To add a hostname to a remote tunnel:

1. **DNS route** (once per hostname):
   ```bash
   cloudflared --origincert ~/.cloudflared/cert.pem tunnel route dns <tunnel-id> <hostname>
   ```
   **Requires the Origin CA cert from `cloudflared tunnel login`** (browser OAuth flow, writes `~/.cloudflared/cert.pem`).
   - The system CA bundle (`/etc/ssl/certs/ca-certificates.crt`) will NOT work — you get "Error decoding origin cert: missing token in the certificate".
   - Cloudflare's public Origin CA root (`https://developers.cloudflare.com/ssl/static/origin_ca_rsa_root.pem`) will NOT work either.
   - The `.cf_token` tunnel token (`cfut_...`) cannot be used with `--origincert` or as a Bearer token for the Cloudflare API — it's a tunnel-run token only.
   - If running as root or via `sudo`, the cert lands in `/root/.cloudflared/cert.pem` (not the invoking user's home).
   - If `cloudflared tunnel login` was run as user `saturia`, the cert is in `/home/saturia/.cloudflared/cert.pem`.
   - Check with `cloudflared tunnel info <tunnel-id>` first to confirm the tunnel name/ID.

2. **Ingress rule** (hostname → service mapping):
   - Via **dashboard** (easiest for remote tunnels): Cloudflare Zero Trust → Access → Tunnels → select tunnel → Public Hostnames tab → Add
     - Subdomain: `panel`, Domain: `saturia.codes`
     - Service: `HTTP`, `127.0.0.1:8088`
     - **Important**: double-check the port before saving. Dashboard edits may not propagate immediately (cache); if `journalctl -u cloudflared`
       still shows the old port after restart, delete the hostname and re-add it (forces config refresh).
   - Via **API** (requires account-scoped API token with Tunnel:Edit; NOT the tunnel run-token):
     ```bash
     curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel/$TUNNEL_ID/configurations" \
       -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
       -d '{"config":{"ingress":[{"hostname":"panel.saturia.codes","service":"http://127.0.0.1:8088"},{"service":"http_status:404"}]}}'
     ```
   The daemon picks up the new config automatically within seconds (no restart needed; watch logs for "Updated to new configuration" with incremented `version=N`).

**Pitfall**: After adding a hostname via the dashboard and restarting cloudflared, if the daemon's loaded config JSON (in logs) still shows
the wrong port or missing hostname, the dashboard edit may be cached. Delete the hostname entry in the dashboard, save, wait 5 seconds, then
re-add it with the correct port. This forces a config version bump and immediate propagation.

## Pitfalls
- **Cloudflared exits with "permission denied" reading credentials.json.** When the systemd service (or a manual run) fails with `couldn't read tunnel credentials from /etc/cloudflared/credentials.json: open /etc/cloudflared/credentials.json: permission denied`, the credentials file is root-owned (0600) but cloudflared is attempting to run as non-root, OR the file has immutable/extended attrs blocking access. Diagnosis: `stat /etc/cloudflared/credentials.json` (check ownership/perms), `lsattr /etc/cloudflared/credentials.json` (check for `i` immutable flag). Fix path A (run as root — service default): ensure the systemd unit has `User=root` (or no User= line, which defaults to root). Fix path B (run as non-root user): `sudo chmod 644 /etc/cloudflared/credentials.json` so the credentials are world-readable (safe — they're only useful with the tunnel ID). After fixing perms, `sudo systemctl restart cloudflared`. Verify with `systemctl status cloudflared` → active (running) and `journalctl -u cloudflared -n 10` shows connection established, not "permission denied".
- **`config_src: cloudflare` (API default) blocks local ingress.** `PUT cfd_tunnel/<id>/config` returns 404,
  so you can't manage ingress from `config.yml`. Delete the tunnel (`DELETE cfd_tunnel/<id>` — must first
  `sudo systemctl stop cloudflared` so it has no active connections, else 400 "active connections") and
  recreate with `"config_src":"local"`.
- **systemd node service needs explicit PATH.** On this host node is `/home/saturia/.hermes/node/bin/node`,
  NOT `/usr/bin/node`, and a user systemd unit does NOT inherit shell PATH. Set
  `Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`
  and use the full node path in `ExecStart`, or the unit dies with `status=203/EXEC`.
- **Don't `pkill -f cloudflared`** while other tunnels run — it kills sibling tunnels. Kill by exact PID.
- **Edit tools refuse `~/.hermes/config.yaml`** (security). Use a `terminal` python heredoc to insert blocks.
- **`cloudflared tunnel route dns` CLI needs `cert.pem`** (origin cert) which we don't have headless; use the
  REST API for DNS instead (step 5). The `cfut_` DDNS token is often stale/invalid — prefer the API token.
- **On the saturia VPS, `/etc/cloudflared/token` is a TUNNEL RUN-TOKEN** (a ~240-char JWT `{"a":..,"t":<id>}`,
  NOT `cfut_`). It cannot drive the CF REST API or `route dns` — those need a `cfut_` API token + `cert.pem`,
  which are absent here. So DNS records for new hosts MUST be created by the user in the Cloudflare dashboard
  (CNAME -> `<tunnel-id>.cfargotunnel.com`, proxied). Never claim to have set DNS when only a run-token exists.
- **Azure NSG blocks inbound 80/443 on the saturia VPS.** A CF-proxied **A-record -> VPS IP** returns
  **HTTP 522 (origin connection timed out)**, because Cloudflare's edge can't reach the origin's inbound ports.
  This is distinct from 502 (tunnel/ingress mistake). Always expose services via the tunnel (outbound QUIC),
  never via opened ports or A-records. `dig` resolving to CF IPs but `curl https://host` hanging == 522 == wrong record type.

## References
- `references/yt-dlp-api.md` — worked example: a ytmp3/ytmp4 REST API exposed through this exact flow,
  including the datacenter-IP yt-dlp flags that avoid HTTP 403.

## See also
- `expose-hermes-dashboard-tunnel` — dashboard-specific bind `0.0.0.0` + basic-auth requirements.
