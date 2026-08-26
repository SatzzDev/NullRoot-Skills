---
name: self-host-vps-services
description: Deploy node / PHP-Laravel / python services on saturia VPS behind CF Tunnel.
---

# Self-Hosting Node Services on the saturia VPS

Use this when the user asks to install/run any web service (n8n, 9Router, a bot dashboard, etc.) on
their VPS and expose it on a `*.saturia.codes` (or `*.satzz.online`) subdomain via the existing
Cloudflare Tunnel. No Docker is available on this box — everything is bare node + PHP-FPM + systemd.

## Environment facts (persistent for this VPS)
- **Separate data disk at `/mnt` (16GB ext4, `/dev/sdb1`).** The root partition (`/`, 29GB) fills
  quickly with large installs. **For monorepos or apps with huge `node_modules` (OmniRoute, n8n with
  plugins, multi-workspace projects), install to `/mnt/<app>` instead of `~/` to avoid ENOSPC.**
  The disk auto-mounts at boot (`x-systemd.after=cloud-init.service,_netdev` in fstab). Update
  systemd `WorkingDirectory=` and file paths accordingly. Check available space: `df -h /mnt`.
- **Node is NOT in default PATH.** It lives only at `/home/saturia/.hermes/node/bin/node`
  (npm/npx beside it). `9router` fails with `/usr/bin/env: 'node': No such file or directory`, and
  any systemd `ExecStart=/path/cli.js` exits 127.
- **Fix (do this first, once):** symlink into `/usr/local/bin` so systemd, CLI tools, and shells
  all find node:
  ```bash
  sudo ln -sf /home/saturia/.hermes/node/bin/node /usr/local/bin/node
  sudo ln -sf /home/saturia/.hermes/node/bin/npm  /usr/local/bin/npm
  sudo ln -sf /home/saturia/.hermes/node/bin/npx  /usr/local/bin/npx
  ```
- Cloudflare Tunnel runs as `cloudflared.service` (root), config `/etc/cloudflared/config.yml`,
  `ingress:` maps hostnames → `http://localhost:PORT`. `api.saturia.codes` (4000) and
  `agent.satzz.online` (9119) already exist — append, don't overwrite.
- **No CF API token / origin cert on the box.** Create DNS CNAMEs via CF REST API with a token the
  user supplies (Zone DNS:Edit for `saturia.codes`). See `references/cloudflare-dns-api.md`.

## Standard deploy sequence
1. `npm install` the app in `/home/saturia/<app>` (or `npm install -g` for CLI tools).
2. Handle native builds (per-app notes below).
3. systemd unit `/etc/systemd/system/<app>.service`:
   - `User=saturia`, `WorkingDirectory=/home/saturia/<app>`
   - `Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`
   - `ExecStart=/home/saturia/.hermes/node/bin/node <absolute/entry.js>` — use the **absolute node
     binary**, never a bare `cli.js` shebang (fails under systemd without PATH).
   - `Restart=on-failure`, `RestartSec=5`.
4. `sudo systemctl daemon-reload && sudo systemctl enable --now <app>.service`.
5. Append ingress to `/etc/cloudflared/config.yml`, `sudo systemctl restart cloudflared`.
6. Create CF DNS CNAME. Verify: `curl -I https://<sub>.saturia.codes` → 200.

## Pterodactyl node + Cloudflare tunnel (nodes.satzz.online / nodes.saturia.online)
When deploying a Pterodactyl Wings node behind a Cloudflare tunnel:

- **Wings listens on port 8080** (and SFTP on 2022). The panel must have `daemonListen` set to **8080**, **not** 443. Panel sends `https://node.fqdn:443` → Cloudflare tunnel forwards to localhost:8080, but if `daemonListen` is 443 the panel will attempt port 443 which tunnels do not proxy by default → connection refused / timeout.

- **Fix**: after creating the node, run inside the panel container:
  ```bash
  sudo -u www-data php artisan p:node:configuration <node-id> --format=yaml
  # verify daemonListen = 8080
  # if 443: sudo -u www-data php -r '
  $app = require "bootstrap/app.php";
  $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
  Illuminate\Support\Facades\DB::table("nodes")->where("id", 1)->update(["daemonListen" => 8080]);
  echo "daemonListen set to 8080\n";
  '
  sudo -u www-data php artisan optimize:clear
  sudo systemctl restart wings
  ```

- **Verify**: `curl -I -H "Authorization: Bearer <token>" https://nodes.fqdn/api/system` → `HTTP/2 200` (Wings authenticated) or at minimum `404` (connection reaches daemon) instead of timeout/connect refused.

- **DNS**: ensure the CNAME record `nodes` → `<tunnel-id>.cfargotunnel.com` exists in the **correct zone** (satzz.online or saturia.codes) and is **Proxied** (orange cloud). Propagation may take 1‑2 minutes.

- **Tunnel ingress**: the `/etc/cloudflared/config.yml` must contain a block
  ```yaml
  - hostname: nodes.<your-domain>
    service: http://localhost:8080
  ```
  above the `http_status:404` fallback, then `sudo systemctl restart cloudflared`.

## Per-app quirks
### n8n (port 5678)
- `npm install n8n` then `npm install sqlite3 --save`. npm **blocks install-scripts**, so the
  native `.node` is missing → n8n crashes "SQLite package has not been found installed". Fix:
  ```bash
  npm install-scripts approve sqlite3 && npm rebuild sqlite3
  ```
  Verify `node_modules/sqlite3/build/Release/node_sqlite3.node` exists, then restart.
- Web UI `/` → owner setup. Set `N8N_PORT`, `N8N_HOST`, `N8N_PROTOCOL=https`, `WEBHOOK_URL` in `.env`.

### api.saturia.codes (port 4000, `api.saturia.codes`)
Self-hosted multi-endpoint API (yt-dlp convert, TikTok via TikWM, 9Router AI proxy, edge-tts,
YouTube search, headless screenshot). Node-only, systemd **user** unit. Durable quirks + the
edge-tts PATH fix in `references/api-saturia-codes.md`. **The agent cannot restart this service
from inside its own session** — ask the user to run `systemctl --user restart api-saturia-codes`
from a separate shell.

### 9Router (port 20128, OpenAI-compatible at `/v1`)
- `npm install -g 9router` → bin `/home/saturia/.local/bin/9router`.
- **DO NOT run `cli.js` under systemd** — it's an interactive launcher that spawns the server then
  exits 0, so systemd kills the child. Spawn the bundled Next.js server directly:
  ```
  ExecStart=/home/saturia/.hermes/node/bin/node /home/saturia/.local/lib/node_modules/9router/app/custom-server.js
  Environment=PORT=20128
  Environment=HOSTNAME=0.0.0.0
  ```
- **Web password / admin reset**: the admin password is a **bcrypt hash (10 rounds, `$2b$…`)**
  stored in the `settings` table, `data` JSON, `.password` field. There is **NO `9router
  --reset-password` command and NO live default password** once a hash is set — the "default
  `123456`" only applies when `settings.password` is null/empty (fresh first-run owner setup). To
  recover a forgotten password, generate a fresh `$2b$10$…` hash yourself and overwrite it in the
  sqlite `settings.data` JSON, then restart the service. The app uses standard bcryptjs
  `compareSync`, so any bcryptjs-generated 10-round hash is accepted. Concrete recipe in
  `references/9router-admin-reset.md`.
- **9Router ALWAYS streams SSE** and has no stream toggle. This breaks n8n's AI Assistant
  "Connect a model" verification (it expects JSON). To route n8n's Assistant through the
  9Router gateway, deploy the non-streaming proxy in `references/n8n-9router-gateway.md`
  (listens on **5680**; n8n credential Base URL → `http://127.0.0.1:5680/v1`).

## Pitfalls
- **Check disk space before installing large monorepos.** The VPS has a 29GB root partition that can
  fill quickly. Large Node.js projects like OmniRoute (3GB+ for `node_modules` alone, plus build
  artifacts) will fail mid-install with `ENOSPC: no space left on device`. Before `npm install` on
  any unfamiliar repo, run `df -h /` and ensure at least 5-10GB free. If space is tight, clear
  `/tmp/*` and `~/.npm` cache first: `rm -rf /tmp/* ~/.npm && npm cache clean --force`. When disk
  hits 100%, run the systematic cache purge in `references/disk-cleanup-recipe.md` (frees ~3.5GB:
  uv/yarn/pip/playwright/electron caches, huggingface, docker prune, system logs).
- **Cloudflare Tunnel public hostname registration: DNS CNAME alone is NOT enough.** Adding a manual
  CNAME record `<sub>.saturia.codes` → `<tunnel-id>.cfargotunnel.com` in CF DNS will resolve but
  return **HTTP 404** from the tunnel because the hostname is not registered with the tunnel itself.
  The local `/etc/cloudflared/config.yml` ingress rule is ignored. **Fix:** delete the manual DNS
  record, then add the hostname via **Cloudflare Zero Trust dashboard** → Networks → Tunnels →
  select tunnel → Public Hostnames → Add. This creates BOTH the DNS record AND registers it with the
  tunnel. Only after this will traffic route correctly. See `references/cloudflare-tunnel-public-hostname.md`.
- **Next.js dev mode cross-origin blocking.** When exposing a Next.js dev server (e.g. OmniRoute)
  behind a tunnel with a public domain, assets fail to load with "Blocked cross-origin request" and
  the dashboard times out. Dev server only allows `localhost` by default. **Fix:** add the public
  hostname to `allowedDevOrigins` array in `next.config.js` (or `.mjs`), e.g.
  `allowedDevOrigins: ["localhost", "127.0.0.1", "omniroute.saturia.codes"]`, then restart the dev
  server. Production builds do not have this issue.
- **Port 5679 is already taken by n8n itself.** Any companion proxy/listener for n8n must use
  a different port (the 9Router-to-n8n proxy in `references/n8n-9router-gateway.md` uses 5680).
  A silent `EADDRINUSE` on 5679 makes the proxy crash-loop with a misleading HTML "Cannot POST"
  error from n8n.
- **When an app returns SSE but the caller expects JSON** (e.g. n8n AI Assistant verifying a model
  against 9Router), don't keep poking the UI — read the app's `verify`/`test` source to learn what
  response shape it parses, then insert a thin proxy that forces `stream:false` / converts SSE→JSON.
  Confirmed recipe in `references/n8n-9router-gateway.md`.
- **9Router password recovery has no official CLI / one-liner.** There is no `9router
  --reset-password` and no live default password once a hash is set. The real path is: read
  `settings.data.password` (bcrypt hash) from the sqlite DB, generate a fresh `$2b$10$…` bcryptjs
  hash, overwrite it via sqlite (run `PRAGMA wal_checkpoint(TRUNCATE)` first — the DB uses WAL and
  the `sqlite3` CLI is NOT installed here, so use python3's `sqlite3`), then restart the service.
  Full steps in `references/9router-admin-reset.md`.
- **`npm install-scripts` blocks native postinstalls** here by default. If a package needs a native
  module and crashes at runtime, approve + rebuild, not reinstall.
- **Tunnel needs a restart** after editing `config.yml` for new ingress to take effect.
- **DNS must exist before the domain resolves** — tunnel 502s until the CNAME is created.
- **Azure NSG blocks inbound 80/443** on this VPS. A plain `A-record -> VPS IP` with CF proxy returns
  **522 (origin timeout)**, not 502. For any `*.satzz.online` / `*.saturia.codes` service, expose via
  the Cloudflared tunnel (outbound QUIC, no open inbound port) and set the CF DNS record as **CNAME ->
  `<tunnel-id>.cfargotunnel.com` proxied**. Don't try to open ports or use A-records — they won't reach origin.
- **DNS for `panel.satzz.online` can't be set from the VPS.** `/etc/cloudflared/token` is a tunnel
  RUN-TOKEN (a ~240-char JWT, body `{"a":..,"t":<tunnel-id>}`) — it is NOT a `cfut_` Cloudflare API
  token, and `cert.pem` is absent. So `cloudflared tunnel route dns` fails ("Cannot determine default
  origin certificate path") and the CF REST API rejects the run-token for DNS edits. The user must
  create the CNAME in the Cloudflare dashboard. State this clearly; never claim to have set DNS.

### Jexactyl v3.1.0 (PHP/Laravel Pterodactyl fork, port 80 via tunnel)
Full recipe in `references/jexactyl-deploy.md`. Key gotchas:
- `php artisan key:generate` can't bootstrap when `APP_KEY` is empty — generate
  `base64:$(openssl rand -base64 32)` and write it to `.env` first.
- Carbon <2.58 is incompatible with the PHP 8.3 patch (setLastErrors bug) → `composer require nesbot/carbon:^2.58`.
- `npm run build` breaks on Node 22 (OpenSSL 3 / old webpack → `ERR_OSSL_EVP_UNSUPPORTED`): run with
  `NODE_OPTIONS=--openssl-legacy-provider`, and `npm install --legacy-peer-deps` to clear eresolve.
- nginx `fastcgi_pass` MUST be the socket `unix:/run/php/php8.3-fpm.sock` — `127.0.0.1:9000` (TCP)
  is refused → nginx 502.
- `DB_HOST=localhost` uses the MariaDB socket; `127.0.0.1` forces TCP and fails for `jexactyl@localhost`
  ("Access denied"). Keep `localhost`.
- Queue worker is mandatory (`jexactyl-queue.service`, `www-data`, `queue:work`) or emails/backups stall.
