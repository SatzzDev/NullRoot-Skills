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
  **Fix path A (dashboard):** Delete the manual DNS record (if exists), then add the hostname via
  **Cloudflare Zero Trust dashboard** → Networks → Tunnels → select tunnel → Public Hostnames →
  Add. This creates BOTH the DNS record (as CNAME) AND registers it with the tunnel.
  **Fix path B (API token required):** Use a `CLOUDFLARE_API_TOKEN` with scope `Zone DNS:Edit` +
  `Cloudflare Tunnel:Edit` to call `cloudflared tunnel route dns <tunnel-id> <sub>.saturia.codes`.
  Only after this will traffic route correctly. See `references/cloudflare-tunnel-public-hostname.md`.
- **⚠️ REMOTELY-MANAGED TUNNEL GOTCHA (saturia VPS specific):** The tunnel `a9521ff9-c74b-422a-a900-6fee7294aa2a`
  is **remotely-managed** — config is pushed from Cloudflare's API to the edge, NOT read from
  `/etc/cloudflared/config.yml`. This means:
  - Editing the local `config.yml` adds routes that are validated locally but **NOT pushed** to the edge.
  - You MUST add hostnames via the dashboard (Option A) or `cloudflared tunnel route dns` (which calls the API).
  - Local `config.yml` edits alone are NOT sufficient to register new hostnames.
  - The tunnel daemon logs `"Updated to new configuration ... version=N"` — this is the REMOTE config
    being pushed, not your local edits. If your hostname isn't in that JSON, it won't route.
  - **No CF API token exists on the VPS.** All `cloudflared tunnel route dns` attempts fail with
    "Cannot determine default origin certificate path" because the Origin CA cert is absent.
    The user must add hostnames via the CF dashboard, OR supply a `CLOUDFLARE_API_TOKEN`.
  See `references/cloudflare-tunnel-public-hostname.md` and `references/cloudflare-tunnel-locally-managed.md`.
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

### Pelican Panel (Laravel 13 + Filament/Livewire, port 8088)

Full recipe in `references/pelican-deploy.md`. Key gotchas:

- **Panel location**: `/var/www/pelican` on the root disk (61GB+). Do NOT use `/var/www/pelican` — that was a temporary/ephemeral disk (`/dev/sdc`) that gets wiped on reboot. All paths below use `/var/www/pelican`.
- **Pelican uses Filament (Livewire)** — the login form uses `wire:submit="authenticate"`, so a direct `POST /login` returns **405 Method Not Allowed**. This is EXPECTED, not a failure. To verify admin credentials, use `artisan tinker` with `Hash::check()` instead (see below).
- **`php artisan key:generate` can't bootstrap when `APP_KEY` is empty** — generate `base64:$(openssl rand -base64 32)` and write it to `.env` first.
- **`.env.example` is minimal (6 lines)** — it only has APP_ENV, APP_DEBUG, APP_KEY, APP_URL, APP_INSTALLED, APP_LOCALE. You MUST construct the full `.env` manually: add DB_* (mysql, localhost, pelican db/user), CACHE_STORE=redis, SESSION_DRIVER=redis, QUEUE_CONNECTION=redis, REDIS_* (empty password if unauthenticated), LOG_*, BROADCAST_DRIVER=log, FILESYSTEM_DISK=local.
- **Redis empty password**: if Redis is unauthenticated (no `requirepass`), set `REDIS_PASSWORD=` (empty). A placeholder like `***` or a fake password breaks cache/session/queue silently.
- **No DatabaseSeeder** — `database/seeders/` does not exist. Pelican uses custom commands: `p:environment:setup`, `p:redis:setup`, `p:plugin:composer`. `db:seed` runs but seeds nothing; settings come from `p:environment:setup`.
- **User creation**: `p:user:make --email= --username= --password= --admin=1 --no-interaction` (NOT `user:make` or `user:create`). If the user already exists (duplicate email error), reset the password via tinker:
  ```bash
  sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
  \$u = \App\Models\User::where('username','admin')->first();
  \$u->password = Hash::make('<new-password>');
  \$u->save();
  "
  ```
  `HOME=/var/tmp` is required because psy tries to write to `/var/www/.config/psysh` and fails.
- **`users` table schema differs from Pterodactyl** — no `root_admin` column in current Pelican. Columns include `external_id`, `is_managed_externally`, `uuid`, `username`, `email`, `password`, `language`, `timezone`, `oauth`, `customization`, `mfa_app_secret`, `mfa_app_recovery_codes`, `mfa_email_enabled`. Don't assume Pterodactyl column names.
- **`APP_INSTALLED=false`** — set in `.env`; Pelican may show an install wizard if not set correctly.
- **npm build**: `NODE_OPTIONS=--openssl-legacy-provider /home/saturia/.hermes/node/bin/npm install --legacy-peer-deps && NODE_OPTIONS=--openssl-legacy-provider /home/saturia/.hermes/node/bin/npm run build` (script is `build`, not `build:production` in some versions — check `package.json`).
- **nginx**: `fastcgi_pass unix:/run/php/php8.3-fpm.sock` (socket, NOT 127.0.0.1:9000). `DB_HOST=localhost` (socket, NOT 127.0.0.1).
- **Queue worker**: `pelican.service`, `www-data`, `ExecStart=/usr/bin/php /var/www/pelican/artisan queue:work --sleep=3 --tries=3`. Mandatory — processes `AccountCreated` notifications etc.
- **Storage perms**: `chown -R www-data:www-data storage bootstrap/cache` before migrate/seed/tinker.
- **Panel web settings/plugin saves need www-data ownership of MORE than storage**: "Failed to save Settings — file_put_contents(/var/www/pelican/.env): Permission denied" means `.env` is still owned by saturia; `sudo chown www-data:www-data /var/www/pelican/.env`. "Could not import plugin — mkdir(): Permission denied" means `plugins/` AND `public/` need `sudo chown -R www-data:www-data /var/www/pelican/plugins /var/www/pelican/public`. Do the full sweep once after install: `sudo chown -R www-data:www-data /var/www/pelican/.env /var/www/pelican/plugins /var/www/pelican/storage /var/www/pelican/bootstrap/cache /var/www/pelican/public /var/www/pelican/node_modules`. The `public/` dir is needed because plugins (e.g. `discord-webhooks`) publish CSS to `public/plugins/<name>/css/` at runtime.
- **Plugin install from web UI needs www-data write on `node_modules` too**: installing a theme plugin (e.g. `nord-theme`) from the admin UI hangs/fails because Pelican runs `yarn install` (spawned in the PHP/www-data context) and yarn must write into `/var/www/pelican/node_modules` — if that dir is still `saturia`-owned, you get `error: EACCES: permission denied, mkdir '/var/www/pelican/node_modules/@rolldown/binding-linux-x64-musl'` plus a harmless yarn cache fallback warning (`/var/www/.cache/yarn` not writable → falls back to `/tmp/.yarn-cache-*`). Fix: include `node_modules` in the www-data chown sweep above, then retry the install in the UI.
- **CLI plugin ops run as the wrong user fail on the other side of the same coin**: `sudo -u www-data php artisan p:plugin:install nord-theme` (or `p:plugin:update/list/disable/uninstall`) from a shell works when `plugins/` is www-data-owned, but running artisan as `saturia` (plain `php artisan p:plugin:install ...`) fails with `file_put_contents(/var/www/pelican/plugins/nord-theme/plugin.json): Permission denied`. Plugin install/update is a **two-phase build**: (1) downloads plugin into `plugins/<id>/` and (2) runs yarn/composer builds — the first phase needs www-data on `plugins/` (and the CLI must run as www-data), the second needs www-data on `node_modules`. Status/verification: `sudo -u www-data php artisan p:plugin:list` shows per-plugin Status column (`enabled` / `not_installed`); `plugins/<id>/plugin.json` → `meta.status` holds the raw install error message (e.g. EACCES) even when the UI just says "not_installed". Also: `storage/logs/laravel.log` must be writable by whoever runs artisan — if a shell artisan run dies with "stream ... could not be opened in append mode", `sudo chown www-data:www-data /var/www/pelican/storage/logs/laravel.log`.
- **composer**: `COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --no-interaction --prefer-dist`. Set `COMPOSER_CACHE_DIR` to a path on the data disk (not root `/`) to avoid ENOSPC on small root partitions.
- **`DecryptException: The MAC is invalid` after reinstall**: When you reinstall Pelican with a new `APP_KEY` but reuse the old database, encrypted columns in the DB (e.g. `nodes.daemon_token`, sessions, cached data) fail to decrypt. The `daemon_token` column on the `nodes` table uses Laravel's `encrypted` cast — accessing it auto-decrypts, and a wrong key throws this error. Fix: re-encrypt the token with the new key via PHP and write it with raw SQL (bypassing Eloquent's auto-encrypt):
  ```bash
  cd /var/www/pelican
  ENC=$(php -r "require 'vendor/autoload.php'; \$app = require 'bootstrap/app.php'; \$app->make('Illuminate\\Contracts\\Console\\Kernel')->bootstrap(); echo Illuminate\\Support\\Facades\\Crypt::encrypt('<plaintext-token>');")
  sudo mysql -u root pelican -e "UPDATE nodes SET daemon_token = '$ENC' WHERE id = 1;"
  ```
  Get the plaintext token from `/etc/pelican/config.yml` (the `token:` line — Wings stores it in plaintext there). After fixing, clear caches: `php artisan config:clear && php artisan cache:clear && php artisan optimize:clear`.
- **Console UI text touches right edge (xterm.js)**: Terminal output is flush against the container edges. Fix is in `resources/css/console.css` — increase `.xterm-rows > div` padding to 16px and add `padding-left: 8px` to `#send-command`. Do NOT pad the `#terminal` container — that misaligns the xterm canvas. See `references/pelican-troubleshooting.md` for details.

### Pelican Wings (Node daemon, Docker-based game server runner)

Wings is the **node daemon** that runs game servers in Docker containers for Pelican Panel. Install after the panel is deployed.

**Prerequisites**: Docker must be installed and running (`docker --version`, `systemctl is-active docker`).

**Install sequence**:
1. **Download Wings binary** (latest release from `pelican-dev/wings`):
   ```bash
   sudo curl -sL https://github.com/pelican-dev/wings/releases/download/v1.0.0-beta29/wings_linux_amd64 -o /usr/local/bin/wings
   sudo chmod +x /usr/local/bin/wings
   wings version  # verify (no --version flag)
   ```
2. **Configure Wings** via panel-generated token:
   ```bash
   sudo mkdir -p /etc/pelican
   sudo wings configure --panel-url https://panel.saturia.codes --token <papp_...> --node 1 --allow-insecure
   ```
   This writes `/etc/pelican/config.yml` with API token, FQDN, ports (SFTP 2022, API 8080).
3. **systemd unit** (`/etc/systemd/system/wings.service`):
   ```ini
   [Unit]
   Description=Pelican Wings Daemon
   After=docker.service
   Requires=docker.service
   PartOf=docker.service

   [Service]
   User=root
   WorkingDirectory=/etc/pelican
   LimitNOFILE=4096
   PIDFile=/var/run/wings/daemon.pid
   ExecStart=/usr/local/bin/wings
   Restart=on-failure
   StartLimitInterval=180
   StartLimitBurst=30
   RestartSec=5s

   [Install]
   WantedBy=multi-user.target
   ```
   Then: `sudo systemctl daemon-reload && sudo systemctl enable --now wings`.
4. **Verify**:
   - `sudo systemctl status wings` → active (running)
   - `sudo journalctl -u wings -n 30` → "processing servers returned by the API total_configs=0" (no servers yet), "network created successfully", "sftp server listening for connections listen=0.0.0.0:2022".
   - Docker network: `docker network ls | grep pelican` → `pelican_nw`.
   - Panel → Nodes → Node #1 → heartbeat should show green/online.

**Key gotchas**:
- **`wings configure` panics if `/etc/pelican` doesn't exist** — create the dir first (`sudo mkdir -p /etc/pelican`).
- **Wings listens on port 8080 (API) and 2022 (SFTP)** — ensure these ports are not already in use. If exposing via Cloudflare Tunnel, the tunnel ingress must map `nodes.<domain>` → `http://localhost:8080`, NOT 8443 or 443.
- **Panel `daemonListen` must be 8080** (not 443) when Wings is behind a Cloudflare Tunnel. The panel config defaults to 443 but the tunnel proxies to localhost:8080. If `daemonListen=443`, the panel attempts to connect on port 443 → connection refused. Fix via tinker:
  ```bash
  sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
  \$n = \App\Models\Node::find(1);
  \$n->fqdn = 'localhost';
  \$n->scheme = 'http';
  \$n->daemon_listen = 8080;
  \$n->save();
  echo 'updated: ' . \$n->fqdn . ' ' . \$n->scheme . ':' . \$n->daemon_listen . PHP_EOL;
  "
  sudo -u www-data php artisan optimize:clear
  sudo systemctl restart wings
  ```
- **Cloudflare Tunnel public hostname registration** — if Wings API returns 502, verify the hostname is registered in **Cloudflare Zero Trust dashboard** (Networks → Tunnels → Public Hostnames), not just as a manual DNS CNAME. The hostname must be added via the dashboard or `cloudflared tunnel route dns` to register it with the tunnel. See `references/cloudflare-tunnel-public-hostname.md`.
- **Subnet conflict warning** ("configured subnet conflicts with existing network, letting Docker auto-assign subnet...") is normal and harmless — Wings detects the conflict and auto-adjusts.
- **User creation**: Wings auto-creates a `pelican` system user (UID 997, GID 986, `/usr/sbin/nologin`) on first start.
- **Move Docker data-root to the data disk** (this VPS root `/` is only 29GB and fills fast; every game server image/container lands in `/var/lib/docker` otherwise). After Wings works, relocate:
  ```bash
  sudo systemctl stop wings docker
  sudo rsync -aP /var/lib/docker/ /var/www/pelican/docker/
  sudo mv /var/lib/docker /var/lib/docker.bak
  sudo mkdir -p /etc/docker
  printf '{\n  "data-root": "/var/www/pelican/docker"\n}\n' | sudo tee /etc/docker/daemon.json
  sudo systemctl start docker && sudo systemctl start wings
  docker info | grep "Docker Root Dir"  # → /var/www/pelican/docker
  sudo rm -rf /var/lib/docker.bak  # only after wings logs show containers restored
  ```
  Verify Wings still sees existing servers/containers after the move (journalctl should show "restoring to previous state").
- **Move Wings data directories to the data disk** — Wings config defaults to `/var/lib/pelican/*` (root disk) for `root_directory`, `data`, `archive_directory`, `backup_directory`, `log_directory`. Relocate to `/var/www/pelican/wings-data`:
  ```bash
  sudo systemctl stop wings
  sudo mkdir -p /var/www/pelican/wings-data
  sudo cp -a /var/lib/pelican/. /var/www/pelican/wings-data/
  sudo chown -R root:root /var/www/pelican/wings-data
  sudo chmod -R 750 /var/www/pelican/wings-data
  sudo cp /etc/pelican/config.yml /etc/pelican/config.yml.bak
  sudo sed -i 's|/var/lib/pelican|/var/www/pelican/wings-data|g; s|/var/log/pelican|/var/www/pelican/wings-data/logs|g' /etc/pelican/config.yml
  sudo mkdir -p /var/www/pelican/wings-data/logs
  sudo systemctl start wings
  ```
  Verify: `sudo grep -E "root_directory|log_directory|data:|archive_directory|backup_directory" /etc/pelican/config.yml` should show `/var/www/pelican/wings-data/*` paths. `tmp_directory` can stay as `/tmp/pelican` (temporary, no need for persistent disk).
- **Panel `public/` ownership for plugin CSS** — after `chown -R www-data:www-data /var/www/pelican/public`, plugin CSS publishing works. The `discord-webhooks` plugin specifically needs `public/plugins/discord-webhooks/css/` writable. If `mkdir(): Permission denied` persists after chown, manually create the dir:
  ```bash
  sudo -u www-data mkdir -p /var/www/pelican/public/plugins/discord-webhooks/css
  sudo -u www-data cp /var/www/pelican/plugins/discord-webhooks/css/discord-preview.css /var/www/pelican/public/plugins/discord-webhooks/css/
  ```
- **Cloudflare Tunnel route for panel** — add `panel.saturia.codes` → `http://127.0.0.1:8088` to `/etc/cloudflared/config.yml` ingress, then `sudo systemctl restart cloudflared`. The tunnel is remotely-managed (config pushed from Cloudflare API), so local file edits alone won't work — the hostname must be added via **Cloudflare Zero Trust dashboard** (Networks → Tunnels → Public Hostnames → Add) or `cloudflared tunnel route dns`.
- **Panel node connection troubleshooting** — if panel shows node as offline/red:
  1. Check Wings is running: `sudo systemctl is-active wings`
  2. Check panel can reach Wings API: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/` (expect 401 = reachable)
  3. Check node config in panel DB: `sudo -u www-data HOME=/var/tmp php artisan tinker --execute="\$n = \App\Models\Node::find(1); echo \$n->fqdn . ' ' . \$n->scheme . ':' . \$n->daemon_listen . PHP_EOL;"`
  4. If `fqdn` is a public hostname without tunnel/DNS, change to `localhost` with `scheme=http` (see fix above)
  5. Check cloudflared logs for origin errors: `sudo journalctl -u cloudflared --no-pager -n 30 | grep -iE "panel.saturia|8088|8080|origin|refused"`

- **Panel node connection troubleshooting** — if panel shows node as offline/red, follow the diagnosis chain in `references/pelican-node-connection-debug.md` (FQDN/scheme mismatch 90% of the time).

- **Troubleshooting common issues** (403 dotfiles, plugin fatal errors, env permission, install hangs) — see `references/pelican-troubleshooting.md`.

Full Wings deploy recipe in `references/pelican-wings-deploy.md`.
