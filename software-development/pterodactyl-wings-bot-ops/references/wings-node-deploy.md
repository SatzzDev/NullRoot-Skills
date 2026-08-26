# Deploy a Wings node on the SAME host as the Pterodactyl panel

Verified end-to-end on the saturia VPS (one box runs: panel @ localhost:80, wings,
cloudflared tunnel). Public node name `nodes.satzz.online`, tunnel
`a9521ff9-c74b-422a-a900-6fee7294aa2a`, zone `satzz.online`
(zone id `2702b094ea503836cb1776f6d0b81b37`).

## Sequence
1. **Node row in DB** (location already created in admin UI):
   ```bash
   cd /var/www/pterodactyl
   sudo -u www-data php artisan p:node:make \
     --name=SG-01 --description="Singapore VPS node" --locationId=1 \
     --fqdn=nodes.satzz.online --public=1 --scheme=https --proxy=1 --maintenance=0 \
     --maxMemory=4096 --overallocateMemory=0 --maxDisk=5120 --overallocateDisk=0 \
     --uploadSize=100 --daemonListeningPort=8080 --daemonSFTPPort=2022 \
     --daemonBase=/var/lib/pterodactyl/volumes
   # force daemonListen=443 so panel hits the tunnel TLS port (443 -> wings:8080)
   sudo -u www-data php -r 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); Illuminate\Support\Facades\DB::table("nodes")->where("id",1)->update(["daemonListen"=>443]);'
   sudo -u www-data php artisan optimize:clear
   ```
2. **Install wings** — download latest linux_amd64 to `/usr/local/bin/wings`, `chmod +x`.
   Verify with `wings version` (reported `v1.13.3`).
3. **Generate config** from the panel:
   ```bash
   sudo -u www-data php artisan p:node:configuration 1 --format=yaml | sudo tee /etc/pterodactyl/config.yml
   sudo chmod 600 /etc/pterodactyl/config.yml
   ```
4. **Patch config.yml** (the generator output is WRONG for a tunnel setup):
   - `api.port: 443`  →  `api.port: 8080`
     (wings must bind 8080; tunnel maps public :443 -> localhost:8080)
   - `remote:` → set to `https://panel.<domain>` (e.g. `https://panel.satzz.online`).
     NOTE: `p:node:configuration` emits `remote: https://panel.<domain>` already, so
     usually no change needed. DO NOT set `remote: http://127.0.0.1` — see Pitfall #1.
5. **systemd** `/etc/systemd/system/wings.service`:
   ```
   [Unit]
   Description=Pterodactyl Wings Daemon
   After=docker.service network-online.target
   Requires=docker.service
   [Service]
   User=root
   ExecStart=/usr/local/bin/wings
   Restart=always
   RestartSec=5
   LimitNOFILE=1048576
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl daemon-reload && sudo systemctl enable --now wings`
6. **Tunnel ingress** — add ABOVE the `http_status:404` fallback in
   `/etc/cloudflared/config.yml`, then `sudo systemctl restart cloudflared`:
   ```yaml
   - hostname: nodes.satzz.online
     service: http://localhost:8080
   ```
   If the tunnel is REMOTELY-MANAGED (Cloudflare Zero Trust dashboard shows only a
   "migration" prompt), the local `config.yml` ingress is IGNORED by the edge. You must
   click "Migrate" in the dashboard first (or set `config_src=local` via API) so the edge
   honors the local config. Until then, only hostnames already present in the dashboard
   route; new ones (like `nodes.satzz.online`) return connection-refused / timeout.
7. **DNS CNAME** `nodes.satzz.online` -> `<tunnelid>.cfargotunnel.com`, proxied,
   in the zone that MATCHES the FQDN (`satzz.online`, not `saturia.codes`).
   A CNAME in the wrong zone makes `dig +short CNAME nodes.satzz.online` return empty.

## Verify (do NOT claim success without these)
```bash
# local daemon alive (401 = needs auth, but daemon is up):
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/system   # -> 401
# public via tunnel WITH QUOTED token (200 = fully connected):
TOK=$(sudo -u www-data php -r 'require "vendor/autoload.php";$app=require "bootstrap/app.php";$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();echo Pterodactyl\Models\Node::find(1)->getDecryptedKey();')
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOK" https://nodes.satzz.online/api/system  # -> 200
# DNS actually published (not just /etc/hosts):
dig @1.1.1.1 +short CNAME nodes.satzz.online   # -> <tunnelid>.cfargotunnel.com
```

## Pitfalls (learned the hard way — each caused hours of looping)
- **#1 CORS error in browser, node red:** If `remote:` is set to `http://127.0.0.1`
  (a common "fix" for DNS-resolution crashes at boot), Wings sets the
  `Access-Control-Allow-Origin` header to `http://127.0.0.1`. The panel (served from
  `https://panel.<domain>`) then gets blocked by CORS:
  `Access-Control-Allow-Origin: http://127.0.0.1 is not equal to the supplied origin`.
  The node shows RED even though `curl .../api/system` returns 200.
  **Fix:** set `remote: https://panel.<domain>` (matches the panel's actual origin) and
  restart wings. Verify the header with
  `curl -sS -D - -o /dev/null -H "Origin: https://panel.<domain>" https://nodes.satzz.online/api/system`
  → must show `access-control-allow-origin: https://panel.<domain>`.
  (If wings crashes at boot with `lookup panel.<domain> on 127.0.0.53:53: no such host`,
  that is a SEPARATE DNS issue — see #5 — not a reason to use `http://127.0.0.1`.)

- **#2 `Bearer *** in bash expands to a glob → 403 "not authorized":** When you write
  `curl -H "Authorization: Bearer *** the shell expands `***` to every filename in the
  cwd, so the token sent to Wings is garbage → constant 403. The daemon, config, and DB
  token are ALL correct; only the test command is broken. **Always capture the token into
  a shell variable and quote it: `TOK=$(...); curl -H "Authorization: Bearer $TOK" ...`.**
  A 403 with the correct token almost always means the token reached Wings corrupted by
  glob expansion, not a real auth mismatch. Distinguish: no-token request → 401; bad-token
  request → 403; good-token → 200.

- **#3 Tunnel REMOTELY-MANAGED ignores local config.yml:** If the Cloudflare Zero Trust
  dashboard → Networks → Tunnels shows only a "migration" prompt (no editable Public
  Hostnames), the tunnel is remotely-managed: the edge ingress lives in Cloudflare's API,
  NOT in `/etc/cloudflared/config.yml`. Any ingress you add locally is silently ignored.
  Symptoms: all pre-existing hostnames (e.g. `panel.satzz.online`) work, but a newly added
  one (`nodes.satzz.online`) returns `Failed to connect` / timeout even though
  `cloudflared tunnel ingress validate` passes and DNS resolves. **Fix:** click "Migrate"
  in the dashboard (or set `config_src=local` via API), then restart cloudflared. After
  migration the local `config.yml` is honored.

- **#4 `DecryptException: The payload is invalid` when reading daemon_token:** The panel's
  `APP_KEY` in `.env` must be a valid Laravel key. If it lacks the `base64:` prefix
  (e.g. a raw 32-byte string without `base64:`), `daemon_token` (encrypted with the new
  key) cannot be decrypted → panel cannot build the auth token → node red. Symptoms:
  `php -r '...Node::find(1)->getDecryptedKey()...'` throws `DecryptException`.
  **Fix:** ensure `APP_KEY=base64:<44-char-base64>` in `.env` (generate with
  `php artisan key:generate`). After fixing, regenerate the node token so it is encrypted
  with the correct key.

- **#5 `/etc/hosts` entry for the node FQDN breaks VPS-side curl:** Adding
  `127.0.0.1 nodes.satzz.online` to `/etc/hosts` (e.g. to let Wings resolve the panel at
  boot) makes EVERY curl from the VPS resolve the node name to localhost instead of
  Cloudflare. Result: `curl https://nodes.satzz.online` → `Failed to connect to
  nodes.satzz.online port 443` even though the tunnel and DNS are fine. **Fix:** remove the
  node's `/etc/hosts` entry (`sudo sed -i '/nodes.satzz.online/d' /etc/hosts`). Keep only
  `127.0.0.1 panel.<domain>` if the panel must be reachable locally. Verify with
  `dig +short CNAME nodes.satzz.online` (should return the tunnel target, not be empty).

- **#6 `daemonListen` vs `api.port` are different things:** `daemonListen` (DB node row) is
  the port the PANEL uses to reach the node — must be `443` so the panel hits the tunnel's
  TLS port (Cloudflare only proxies :443 by default). `api.port` (wings config.yml) is the
  port WINGS binds locally — must be `8080` (tunnel forwards :443 → localhost:8080).
  Setting both to 443 (or both to 8080) breaks the chain. Keep `daemonListen=443` in DB,
  `api.port=8080` in config.yml.

## Known crash signatures
- `FATAL: failed to load server configurations ... lookup panel.<domain> on 127.0.0.53:53: no such host`
  → DNS resolution fails at Wings boot. Do NOT "fix" by setting `remote: http://127.0.0.1`
  (that causes Pitfall #1). Instead add `127.0.0.1 panel.<domain>` to `/etc/hosts` (panel
  only, not the node) OR ensure the panel FQDN resolves. Wings needs to resolve the panel
  at boot to fetch server configs; the panel reaching the node is independent of this.
- `FATAL: failed to configure docker environment ... Pool overlaps with other one on this address space`
  → add a `docker:` block to config.yml with a subnet not used by existing docker networks
    (e.g. `172.21.0.0/16`). Check `docker network ls` + inspect subnets first.
- `invalid pool request` only appears if another docker network already owns the subnet wings picks.
