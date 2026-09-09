# Panel → Wings Node Connection Troubleshooting

## Symptom
Panel shows node as **offline/red** or "gagal konek ke wings", even though `wings.service` is active and listening.

## Root Cause Chain (in order of likelihood)

### 1. Panel node FQDN/scheme mismatch (MOST COMMON)
Panel DB stores `fqdn`, `scheme` (http/https), and `daemon_listen` (port). If `fqdn` is a public hostname that resolves to Cloudflare IP (not local), panel tries to reach Wings through CF tunnel — which may not exist for that hostname.

**Symptom:** `https://node.saturia.codes:443` in panel node config, but Wings listens `0.0.0.0:8080` (HTTP, no TLS). The panel tries port 443 (default HTTPS) but Wings serves 8080 → connection refused.

**Fix (same-machine nodes):** Set node to `http://localhost:8080` (internal, bypasses DNS/tunnel):

```bash
# Calagopus panel (Postgres):
psql -U calagopus -c "UPDATE nodes SET fqdn='localhost', scheme='http', daemon_listen=8080 WHERE id=1;"
php artisan optimize:clear && sudo systemctl restart wings

# Pelican panel (MariaDB):
sudo mariadb -e "USE pelican; UPDATE nodes SET fqdn='localhost', scheme='http', daemon_listen=8080 WHERE id=1;"
sudo -u www-data php artisan optimize:clear
sudo systemctl restart wings
```

**Fallback if tinker fails** (psy write error): update the DB directly via SQL/mariadb.

### 2. Wings not listening on expected port
**Check:** `sudo systemctl is-active wings && sudo journalctl -u wings --no-pager -n 20 | grep "listening for connections"`
**Expected:** `sftp server listening for connections listen=0.0.0.0:2022`

### 3. Panel can't reach Wings API (firewall/localhost)
**Check:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/`
**Expected:** `401` (Wings is reachable, rejects unauthenticated request)

### 4. Cloudflare Tunnel origin error (panel 502 or frontend network error)
If panel itself returns 502 from CF tunnel, or the panel UI shows "Frontend to Wings: Could not reach the node: Network Error":

```bash
sudo journalctl -u cloudflared --no-pager -n 30 | grep -iE "wings|8080|origin|refused"
```

**Frontend-only failure (backend succeeds):** The tunnel ingress and DNS are configured for the Wings hostname (e.g. `wings.saturia.codes`), but the hostname is not registered with the tunnel via the cloudflared route. The panel backend (server-to-server) bypasses the tunnel (uses localhost or direct IP), but the user's browser (frontend) tries to reach Wings via the tunnel URL and gets a 404 because the hostname isn't registered with the tunnel.

**Remotely-managed tunnel gotcha:** The saturia VPS tunnel (`a9521ff9-...`) is **remotely-managed** — config is pushed from Cloudflare API, NOT read from `/etc/cloudflared/config.yml`. Editing the local file alone does NOT add routes. You MUST add hostnames via **Cloudflare Zero Trust dashboard** → Networks → Tunnels → Public Hostnames → Add, OR via `cloudflared tunnel route dns <tunnel-id> <hostname>` (which calls the API, not the local file). Local `config.yml` edits are validated but not pushed.

### 5. DNS not registered with the tunnel (frontend connection failure)
**Symptom:** Panel UI shows "Frontend to Wings: Network Error" while "Backend to Wings: Connection established" is green. Or `curl -I https://wings.example.com/` returns HTTP 404 from Cloudflare.

**Root cause:** The DNS CNAME record exists (or was added manually), but the hostname is NOT registered as a **public hostname** in the tunnel's config on the Cloudflare edge. A CNAME pointing to `<tunnel-id>.cfargotunnel.com` without a matching public hostname registration returns 404.

**Fix:** Register the hostname with the tunnel via dashboard:
1. Cloudflare Zero Trust → Networks → Tunnels → select the tunnel
2. Public Hostnames tab → Add
   - **Subdomain:** `wings`
   - **Domain:** `saturia.codes`
   - **Service:** `HTTP`
   - **URL:** `localhost:8080`
3. Save and wait ~30 seconds for propagation.

Or via CLI (requires `cert.pem` from `cloudflared tunnel login`, which is NOT available on this host — use dashboard instead):
```bash
cloudflared --origincert ~/.cloudflared/cert.pem tunnel route dns <tunnel-id> wings.saturia.codes
```

### 6. Wings data directory permission denied
Wings creates `pelican` system user (UID 997, GID 986) on first start. If `root_directory` is on a disk owned by saturia/root, Wings can't write.
**Fix:** `sudo chown -R pelican:pelican /var/www/pelican/wings-data` (or wherever `root_directory` points).

## Verification sequence
```bash
# 1. Wings running?
sudo systemctl is-active wings

# 2. Panel node DB config correct?
# Calagopus (Postgres):
psql -U calagopus -c "SELECT fqdn, scheme, daemon_listen FROM nodes WHERE id=1;"
# Pelican (MariaDB):
sudo mariadb -e "USE pelican; SELECT fqdn, scheme, daemon_listen FROM nodes WHERE id=1;"

# 3. Panel can reach Wings locally?
curl -s -o /dev/null -w "wings_api=%{http_code}\n" http://localhost:8080/

# 4. CF tunnel routing panel correctly?
curl -s -o /dev/null -w "panel=%{http_code}\n" https://panel.saturia.codes/login

# 5. CF tunnel routing Wings correctly (frontend check)?
curl -s -o /dev/null -w "wings_frontend=%{http_code}\n" https://wings.saturia.codes/
# Expected: 401 (Wings auth) — NOT 404 (hostname not registered with tunnel)

# 6. Wings recent errors?
sudo journalctl -u wings --no-pager -n 20 | tail -10
```

## Notes
- Panel node config (`fqdn`, `scheme`, `daemon_listen`) is in the `nodes` table, NOT in `/etc/pelican/config.yml`. The Wings config only has the panel URL + API token.
- Setting `fqdn=localhost` works because panel and wings are on the same machine. For remote nodes, use the node's public IP/hostname with proper tunnel/DNS.
- After changing node config, run `optimize:clear` and restart Wings to refresh connections.
- **For remote nodes behind CF Tunnel:** the node hostname (e.g. `wings.saturia.codes`) MUST be registered as a public hostname in CF Zero Trust dashboard → Tunnels → Public Hostnames, with service `http://localhost:8080`. The panel then connects via the tunnel (443→8080). The `daemon_listen` in panel DB must still be 8080 (the port Wings actually listens on), NOT 443.
- **URL vs Public URL in panel:** The **URL** field is for server-to-server (panel backend → Wings API). The **Public URL** field is for browser-to-Wings (file manager uploads, console WebSocket). For same-machine nodes, set URL to `http://localhost:8080`. For cross-VPS nodes behind a tunnel, set URL to the public HTTPS tunnel URL of the Wings node VPS. The Public URL is always the HTTPS tunnel URL accessible from the browser.
