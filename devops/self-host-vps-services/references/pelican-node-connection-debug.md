# Pelican Panel → Wings Node Connection Troubleshooting

## Symptom
Panel shows node as **offline/red** or "gagal konek ke wings", even though `wings.service` is active and listening.

## Root Cause Chain (in order of likelihood)

### 1. Panel node FQDN/scheme mismatch (MOST COMMON)
Panel DB stores `fqdn`, `scheme` (http/https), and `daemon_listen` (port). If `fqdn` is a public hostname that resolves to Cloudflare IP (not local), panel tries to reach Wings through CF tunnel — which may not exist for that hostname.

**Symptom:** `https://node.saturia.codes:443` in panel node config, but Wings listens `0.0.0.0:8080` (HTTP, no TLS). The panel tries port 443 (default HTTPS) but Wings serves 8080 → connection refused.

**Fix (same-machine nodes):** Set node to `http://localhost:8080` (internal, bypasses DNS/tunnel):

```bash
cd /var/www/pelican && sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
use App\Models\Node;
\$n = Node::find(1);
\$n->fqdn = 'localhost';
\$n->scheme = 'http';
\$n->daemon_listen = 8080;
\$n->save();
echo 'updated: ' . \$n->fqdn . ' ' . \$n->scheme . ':' . \$n->daemon_listen . PHP_EOL;
"
sudo -u www-data php artisan optimize:clear
sudo systemctl restart wings
```

**Fallback if tinker fails** (psy write error): update the DB directly via MySQL:
```bash
sudo mariadb -e "USE pelican; UPDATE nodes SET fqdn='localhost', scheme='http', daemon_listen=8080 WHERE id=1; SELECT fqdn, scheme, daemon_listen FROM nodes WHERE id=1;"
sudo -u www-data php artisan optimize:clear
sudo systemctl restart wings
```

### 2. Wings not listening on expected port
**Check:** `sudo systemctl is-active wings && sudo journalctl -u wings --no-pager -n 20 | grep "listening for connections"`

**Expected:** `sftp server listening for connections listen=0.0.0.0:2022`

### 3. Panel can't reach Wings API (firewall/localhost)
**Check:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/`

**Expected:** `401` (Wings is reachable, rejects unauthenticated request)

**If connection refused:** Wings crashed or not started. Check `sudo journalctl -u wings -n 30` for panics.

### 4. Cloudflare Tunnel origin error (panel 502)
If panel itself returns 502 from CF tunnel:
```bash
sudo journalctl -u cloudflared --no-pager -n 30 | grep -iE "panel.saturia|8088|8080|origin|refused"
```

**Common:** `dial tcp 127.0.0.1:8080: connect: connection refused` means CF tunnel config points to wrong port (8080 vs 8088). Fix in CF Zero Trust dashboard → Tunnels → Public Hostnames.

**Remotely-managed tunnel gotcha:** The saturia VPS tunnel (`a9521ff9-...`) is **remotely-managed** — config is pushed from Cloudflare API, NOT read from `/etc/cloudflared/config.yml`. Editing the local file alone does NOT add routes. You MUST add hostnames via **Cloudflare Zero Trust dashboard** → Networks → Tunnels → Public Hostnames → Add, OR via `cloudflared tunnel route dns <tunnel-id> <hostname>` (which calls the API, not the local file). Local `config.yml` edits are validated but not pushed.

### 5. Wings data directory permission denied
Wings creates `pelican` system user (UID 997, GID 986) on first start. If `root_directory` is on a disk owned by saturia/root, Wings can't write.

**Fix:** `sudo chown -R pelican:pelican /var/www/pelican/wings-data` (or wherever `root_directory` points).

## Verification sequence
```bash
# 1. Wings running?
sudo systemctl is-active wings

# 2. Panel node DB config correct?
cd /var/www/pelican && sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
use App\Models\Node;
\$n = Node::find(1);
echo \$n->fqdn . ' ' . \$n->scheme . ':' . \$n->daemon_listen . PHP_EOL;
"
# Fallback if tinker fails:
sudo mariadb -e "USE pelican; SELECT fqdn, scheme, daemon_listen FROM nodes WHERE id=1;"

# 3. Panel can reach Wings locally?
curl -s -o /dev/null -w "wings_api=%{http_code}\n" http://localhost:8080/

# 4. CF tunnel routing panel correctly?
curl -s -o /dev/null -w "panel=%{http_code}\n" https://panel.saturia.codes/login

# 5. Wings recent errors?
sudo journalctl -u wings --no-pager -n 20 | tail -10
```

## Notes
- Panel node config (`fqdn`, `scheme`, `daemon_listen`) is in the `nodes` table, NOT in `/etc/pelican/config.yml`. The Wings config only has the panel URL + API token.
- Setting `fqdn=localhost` works because panel and wings are on the same machine. For remote nodes, use the node's public IP/hostname with proper tunnel/DNS.
- After changing node config, run `optimize:clear` and restart Wings to refresh connections.
- **For remote nodes behind CF Tunnel:** the node hostname (e.g. `node.saturia.codes`) MUST be registered as a public hostname in CF Zero Trust dashboard → Tunnels → Public Hostnames, with service `http://localhost:8080`. The panel then connects via the tunnel (443→8080). The `daemon_listen` in panel DB must still be 8080 (the port Wings actually listens on), NOT 443.
