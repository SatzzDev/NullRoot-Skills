# Pterodactyl + Cloudflare Tunnel Debug Reference

**Session**: Aug 24 2026 – nodes.satzz.online / nodes.saturia.online

## Problem
- Panel → Wings request timed out / `Could not resolve host` / `Connection refused`.
- Cloudflare tunnel terminated TLS at 443 and forwarded plain HTTP to localhost:8080.
- Node config had `daemonListen: 443`, causing panel to attempt port 443 which tunnels **do not** proxy by default.
- Result: HTTP 404 (reaches daemon) instead of timeout/connect‑refused, but panel still showed node offline.

## Root‑cause checklist (ordered by frequency)
| # | Item | Why it matters |
|---|------|----------------|
| 1 | `daemonListen` = **443** in panel DB | Panel sends `https://node.fqdn:443`, tunnel forwards to 8080 mismatch |
| 2 | Wings listening on **8080** (default) | Tunnel ingress maps `service: http://localhost:8080` |
| 3 | CNAME DNS in **wrong zone** (satzz.online vs saturia.codes) | `dig` returns empty → request never reaches origin |
| 4 | Tunnel ingress block **below** the `http_status:404` fallback | cloudflared ignores the new hostname |
| 5 | `Authorization: Bearer <token>` header missing from verify curl | `401` vs `200` confusion |

## Fix procedure (one‑shot)
```bash
# 1. Ensure tunnel ingress is correct (add above the 404 fallback)
sudo grep -A1 'http_status:404' /etc/cloudflared/config.yml
# Should show:
#   - hostname: nodes.satzz.online
#     service: http://localhost:8080
#   - service: http_status:404

# 2. Restart cloudflared so it re‑loads the ingress
sudo systemctl restart cloudflared

# 3. Verify daemonListen in panel is 8080
cd /var/www/pterodactyl
sudo -u www-data php artisan p:node:configuration 1 --format=yaml
# If daemonListen ≠ 8080, force it:
sudo -u www-data php -r '
$app = require "bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\DB::table("nodes")->where("id", 1)->update(["daemonListen" => 8080]);
echo "daemonListen set to 8080\n";
'
sudo -u www-data php artisan optimize:clear

# 4. Restart Wings so it picks up the new config
sudo systemctl restart wings

# 5. Verify from the VPS (no more timeout!)
curl -I -H "Authorization: Bearer TeqVv7GJX2sXZtKJ2VSAoS8iB5AFIFI3ukoX2YHL0YtRKm6IWWCH26nnGMzRccRv" \
  https://nodes.satzz.online/api/system
# Expected: HTTP/2 200 (Wings authenticated) or at minimum 404 (daemon reachable)
# NOT: Could not resolve host / Connection refused
```

## Quick sanity checks
- `dig +short CNAME nodes.satzz.online` → must return `a9521ff9‑…cfargotunnel.com.`
- `ss -ltnp | grep ':8080'` → Wings LISTEN on *:8080
- `sudo systemctl is-active wings` → `active`
- Panel → Nodes → SG‑01 → should show **green** (healthy)

## TL;DR
`daemonListen` **must be 8080**; panel + tunnel + Wings all line‑up on that port. If it’s 443 the panel will keep timing out even though the tunnel is up.