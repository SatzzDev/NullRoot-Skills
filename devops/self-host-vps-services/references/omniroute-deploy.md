# OmniRoute Deployment Notes

OmniRoute (https://github.com/diegosouzapw/OmniRoute) is a unified AI gateway/router supporting 353 providers with auto-fallback. Large monorepo footprint.

## Requirements

- **Disk space:** 5-10GB free minimum (npm install alone: 3GB `node_modules`, build adds more). **On this VPS, install to `/mnt/OmniRoute` instead of `~/OmniRoute`** — the separate 16GB data disk has ample room and avoids filling the root partition.
- **Node:** v22.22.2+ or v24+ (engines: `>=22.22.2 <23 || >=24.0.0 <27`)
- **Memory:** Production build (`npm run build`) can OOM-kill on machines with <4GB RAM and no swap. **Dev mode (`npm run dev`) is a working alternative** — uses Turbopack hot reload instead of a standalone build, starts faster, and runs reliably on 2GB RAM boxes

## Install sequence

```bash
# 1. Check space FIRST
df -h / /mnt
# If root (/) < 5GB free, run disk-cleanup-recipe.md steps 1-3
# Prefer /mnt for install (16GB separate disk, usually empty)

# 2. Clone to /mnt
cd /mnt
sudo git clone https://github.com/diegosouzapw/OmniRoute.git
sudo chown -R saturia:saturia /mnt/OmniRoute

# 3. Install (background, 3-10 min)
cd /mnt/OmniRoute
npm install
# Auto-generates .env from .env.example during postinstall

# 4. PRODUCTION BUILD (optional, OOM-prone)
npm run build
# Next.js 16 standalone build; takes 5-15 min, can exit -9 (OOM) on low-RAM VPS
# If build fails with exit -9, use dev mode instead (see Dev Mode Service below)

# 5. Verify
node bin/omniroute.mjs --version
# Should show v3.8.51 (or current)
```

## Systemd service (production build)

```ini
[Unit]
Description=OmniRoute AI Gateway
After=network.target

[Service]
Type=simple
User=saturia
WorkingDirectory=/mnt/OmniRoute
Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=PORT=20129
Environment=HOSTNAME=0.0.0.0
ExecStart=/home/saturia/.hermes/node/bin/node /mnt/OmniRoute/bin/omniroute.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install: `sudo cp omniroute.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now omniroute.service`

## Dev Mode Service (when production build OOMs)

If `npm run build` fails with exit code -9 (OOM), run in dev mode instead. Dev mode uses Turbopack on-demand compilation and works reliably on low-RAM VPS:

```ini
[Unit]
Description=OmniRoute AI Gateway (Dev Mode)
After=network.target

[Service]
Type=simple
User=saturia
WorkingDirectory=/mnt/OmniRoute
Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=development
Environment=PORT=20129
Environment=HOSTNAME=0.0.0.0
ExecStart=/home/saturia/.hermes/node/bin/npm run dev
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Dev mode takes 30-60s to start (compiling instrumentation + initial routes). Service is `active (running)` immediately, but port won't be listening until you see `[Next] dev server listening on http://0.0.0.0:20129 (turbopack)` in the journal.

## Port configuration

Default: PORT=20128 (set in `.env` line 117). Override via `Environment=PORT=` in systemd unit.

## Cloudflare Tunnel + DNS

**CRITICAL:** Adding a hostname requires TWO steps — local config AND Cloudflare registration. Missing the second step produces 404s even when DNS and local config are correct.

### Step 1: Local tunnel config

```yaml
# /etc/cloudflared/config.yml
ingress:
  - hostname: omniroute.saturia.codes
    service: http://localhost:20129
  # ... existing entries
  - service: http_status:404
```

Then: `sudo systemctl restart cloudflared`

Verify local routing: `sudo cloudflared tunnel ingress rule https://omniroute.saturia.codes` should match the new ingress entry.

### Step 2: Register public hostname in Cloudflare

**You MUST register the hostname via Cloudflare Zero Trust dashboard** — a manual DNS CNAME or `Type: Tunnel` DNS record is NOT sufficient. The tunnel edge will return 404 until the hostname is registered.

1. https://one.dash.cloudflare.com/
2. Zero Trust → Networks → Tunnels → **satzz-online** (tunnel ID `a9521ff9-c74b-422a-a900-6fee7294aa2a`)
3. Tab **Public Hostnames** → **Add a public hostname**
4. Fill:
   - Subdomain: `omniroute`
   - Domain: `saturia.codes`
   - Type: `HTTP`
   - URL: `localhost:20129`
5. Save

If you get "A DNS record with this name already exists", delete the manual DNS record first (the dashboard will create the correct one automatically when you add the public hostname).

**Verify:** `curl -I https://omniroute.saturia.codes` should return HTTP 307 or 200, NOT 404. Check tunnel logs: `sudo journalctl -u cloudflared -n 20` should show request traffic after registration.

## Pitfalls

- **Tunnel returns 404 even when DNS and local config are correct:** The most common mistake is configuring `/etc/cloudflared/config.yml` and DNS but forgetting to register the public hostname in Cloudflare Zero Trust dashboard. `cloudflared tunnel ingress rule` will show a match locally, `curl localhost:PORT` works, DNS resolves to Cloudflare IPs, but `curl https://hostname` returns 404 with no traffic in tunnel logs. **Do not loop on DNS checks or config validation** — if local ingress matches and localhost responds, the issue is missing Cloudflare registration. Go straight to Zero Trust → Tunnels → Public Hostnames and add the hostname there. See "Step 2: Register public hostname in Cloudflare" above.
- **Production build OOMs (exit -9) on low-RAM VPS:** `npm run build` spawns Next.js/Turbopack which can consume 3-4GB+ during optimization. On a 7.7GB VPS with no swap and other services running, the build gets OOM-killed. **Solution: use dev mode service instead** (see Dev Mode Service above). Dev mode is production-ready for self-hosted single-user gateways — it's the same Next.js server, just with on-demand compilation instead of pre-built artifacts.
- **Missing `app/server.js` → exit 1:** The CLI bin is a launcher that requires the Next.js standalone build. Running `bin/omniroute.mjs` without `npm run build` first fails with "Server not found at: /home/saturia/OmniRoute/app/server.js". If you skipped the build due to OOM, use the dev mode service which doesn't need `app/server.js`.
- **ENOSPC mid-install:** OmniRoute is 3GB+ installed. If `npm install` fails with `ENOSPC`, the disk is full. **First choice: install to `/mnt` instead** (16GB separate disk). If already at `/mnt`, clear cache (`rm -rf ~/.npm /tmp/*; npm cache clean --force`) and retry. See `disk-cleanup-recipe.md` for full recovery (frees ~3.5GB from caches/logs/docker).
- **Build can also fail on low disk:** `npm run build` (Next.js + Turbopack) writes large temp artifacts. Ensure 5GB+ free before building.
- **Port not listening immediately after systemctl start in dev mode:** Dev mode compiles on first request. After `systemctl start`, wait 30-60s and check `journalctl -u omniroute -f` for `[Next] dev server listening on http://0.0.0.0:20129` before testing `curl`.
- **Security warning on 0.0.0.0 bind:** OmniRoute logs "listening on 0.0.0.0 with NO API-key requirement" by default. Set `REQUIRE_API_KEY=true` in `.env` or bind `OMNIROUTE_SERVER_HOST=127.0.0.1` if exposing publicly without auth.

## Default features (zero-config)

- 90+ free-tier providers (~1.51B tokens/month headline)
- RTK + Caveman compression (15-95% token savings)
- MCP server (110 tools, 3 transports)
- Dashboard at `http://localhost:PORT/dashboard`

Requires no API keys to start (free tiers work OOTB); add keys in `.env` or dashboard for paid providers.
