---
name: recover-cgnat-inbound-blocking
title: Recover a Service Hidden Behind CGNAT or ISP-Blocked Inbound
description: "Expose a self-hosted service when inbound ports are blocked."
version: 0.1.0
author: Hermes
platforms: [linux]
metadata:
  hermes:
    tags: [Cloudflare, Tunnel, CGNAT, Pterodactyl, Networking, Self-hosting]
---

## When to Use

- Service reachable internally but **times out on its public IP/domain**.
- Port scans return closed/timeout but nginx listens `0.0.0.0`.
- You’re inside **WSL, home LAN, or CGNAT** and can’t forward ports.
- Cloudflare Tunnel / `cloudflared` already available; domain on **Cloudflare zone**.
- Need to migrate a panel/node after **domain ownership change** (e.g. `old.codes` → `new.online`).

## Prerequisites

1. Domain on Cloudflare (zone + account id).
2. **Account-scoped API Token** (NOT DNS-only): `Account → Cloudflare Tunnel → Edit`, `Zone → DNS → Edit`, scope **All accounts** + target zone.
3. `cloudflared` (2024+ recommended).
4. SSH/root access to service host (systemd services).
5. If using Pterodactyl: node `remote`, `daemonListen`, `fqdn` fields mutable & `config.yml`.

## How to Run

Invoke through the `terminal`, `write_file`, and `cronjob` tools. This skill does NOT open router ports — it routes traffic **outbound over HTTPS/QUIC**.

Canonical invocation:

```bash
# 1) create tunnel (one-liner, idempotent)
cloudflared tunnel create <name>

# 2) point service upstream — see Procedure
# 3) route DNS CNAME → <tunnel-uuid>.cfargotunnel.com
# 4) run as service
sudo systemctl start cloudflared
```

## Quick Reference

| Step | Command / API |
|------|---------------|
| list accounts | `GET /accounts?per_page=50` |
| zone id | `GET /zones?name=<domain>` |
| create tunnel | `POST /accounts/<id>/cfd_tunnel` |
| route DNS CNAME | `PUT /zones/<id>/dns_records/<id>` |
| run tunnel | `cloudflared tunnel --config config.yml run` |
| Wings daemon | `/etc/pterodactyl/config.yml` `remote:/api.host:/api.port` |

## Procedure

1. **Diagnose**. From outside host (phone/mobile data ≠ WiFi) `curl -o /dev/null -w '%{http_code}' https://host/` ; `curl https://api.ipify.org` vs host IP (mismatch ⇒ CGNAT). If HTTP 530/timeout while local listen = inbound block confirmed.
2. **DNS migrate.** Point `panel.<domain>` (and `node.<domain>`) CNAMEs at Cloudflare. Use **zone-scoped** token (DNS:Edit) if only DNS — see Pitfalls.
3. **Prefer reusing an existing tunnel** *(9router, 9r.satzz.online case study)*. If `cloudflared tunnel route ls` shows the hostname already bound to a running tunnel whose `config.yml` you control, skip creating a new tunnel. Instead: (a) append the new `- hostname: <sub>.<domain>` / `service: http://localhost:<port>` ingress block to the *existing* tunnel's `config.yml` (place it **above** the `http_status:404` fallback); (b) restart **that** tunnel's systemd unit (`sudo systemctl restart cloudflared[-<name>]`) to reload config; (c) verify a single process remains. See `references/cgnat-tunnel-lifecycle.md` for the full decision tree and the dual-process kill pattern.
4. **Tunnel via API**. Get **Account ID** from `GET /accounts` (DNS-only tokens can’t list accounts — use the account the zone belongs to; fetch zone first then `/zones/<id>` gives account via `GET /zones/<id>/dns_records` won’t — use `GET /accounts` with zone-scoped token fails → use account-scoped). Create tunnel: `POST /accounts/<account_id>/cfd_tunnel` ⇒ capture `id` & `tunnel_uuid`. Get **credentials-file**: `POST /accounts/<id>/tunnel/<uuid>/keys` is NOT exposed; instead run `cloudflared tunnel create <name>` locally which writes `~/.cloudflared/<uuid>.json` and registers. (If can’t `cloudflared login`, token must include `Account → Cloudflare Tunnel:Edit`.)
4. **Wings origin fix** (Pterodactyl). Edit `/etc/pterodactyl/config.yml`: set `api.ssl.enabled: false`, `api.host: 127.0.0.1`, `api.port: 8080`, `remote: https://panel.<domain>`. Restart `systemctl restart wings`. Node DB fields: `fqdn=node.<domain>`, `scheme=https`, `behind_proxy=1`, `daemonListen=443` (so panel JS generate 443, not :8080). Clear `php artisan optimize:clear`.
5. **Tunnel ingress** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: <uuid>
   credentials-file: ~/.cloudflared/<uuid>.json
   ingress:
     - hostname: panel.<domain>
       service: https://localhost:443
       originRequest: { noTLSVerify: true }
     - hostname: node.<domain>
       service: http://localhost:8080
     - service: http_status:404
   ```
6. **Run service** `sudo systemctl cat cloudflared` → ensure runs as unprivileged user owning `credentials-file`; `journalctl -fu cloudflared` must show `Registered tunnel connection`.
7. **Automate token rotation / expiry**: token above used for one-shot; revoke once tunnel running.
8. **Optional** — cert for node (if panel↔wings HTTPS required): generate **self-signed** or run `certbot --standalone` only when **port 80 is free** (often not under CGNAT). Prefer self-signed for daemon-to-panel.

## Pitfalls

- **DNS-scoped token can’t build tunnels.** `GET /accounts` returns `[]` ⇒ token only Zone-level. Must be Account-scoped (`Account → Cloudflare Tunnel → Edit`, scope `All accounts`).
- **CNAME conflicts.** Cloudflare rejects adding A-record if CNAME exists at same name; DELETE the A first or tunnel CNAME first.
- **`ERR_SSL_PROTOCOL_ERROR`** (port 8080) = panel JS uses `fqdn:daemonListen` (DB). Must set `daemonListen=443` so panel pings `https://node.<domain>` (443), not `:8080`.
- **`node.saturia.codes` leftover** — old domain CNAME/IP not cleaned causes split-brain; verify all node fields point at new domain.
- **Global API Key deprecated March 2026** — new tokens required; `cfk_` tokens may be invalid.
- **`cloudflared tunnel route dns` ≠ Cloudflare REST API call.** A stale API token (e.g. a rotated `cfut_…` from a DDNS script) returns `Invalid API Token` from `GET /user/tokens/verify` and silent empty results from `/zones/<id>/dns_records?...`. But `cloudflared tunnel route dns …` authenticates with the tunnel's own **origin certificate** (`~/.cloudflared/cert.pem` + `<tunnel>.json`), so it still succeeds. Rule: for routing/CNAME registration, prefer the CLI over raw REST; only use REST API when you have a verified Account-scoped token.
- **Reuse existing tunnel instead of creating a new one.** When `cloudflared tunnel route ls` shows a hostname already bound to a running tunnel whose config you control, restart *that* tunnel (via its systemd unit) after editing `config.yml` instead of minting a fresh tunnel. This avoids CNAME rebinding races and duplicate-connector warnings.
- **Duplicate cloudflared processes** on the same tunnel cause flapping connections. After starting via systemd, verify exactly one process: `pgrep -af cloudflared | grep '<tunnel-id>.*tunnel.*run'`; kill only the stale legacy PID (`kill -9 <pid>`), never `pkill -f cloudflared` while other tunnels share the host.
- **Wings container ≠ daemon** — in this case Wings daemon runs on host (`systemd`), bot container is *separate* (`ad395f3d-…`). Don’t restart bot container to fix Wings TLS errors.

## Verification

```bash
curl -sS -m 15 -o /dev/null -w 'HTTP %{http_code}\n' https://node.<domain>/api/system
# expect HTTP 401 (auth required = Wings reachable via tunnel)
journalctl -u cloudflared --no-pager -n 5 | grep -i 'registered tunnel connection'
journalctl -u wings --no-pager -n 5 | grep -i 'fetching list of servers'
```
