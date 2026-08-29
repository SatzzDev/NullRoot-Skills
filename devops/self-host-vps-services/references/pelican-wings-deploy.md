# Pelican Wings Deploy Recipe

Complete recipe for installing Pelican Wings (game server daemon) on the saturia VPS.

## Prerequisites
- Panel already deployed at `/var/www/pelican` and reachable
- Docker installed and running (`docker --version`, `systemctl is-active docker`)
- Node created in panel (to get the configure token)

## Step 1: Download Wings binary

```bash
sudo curl -sL https://github.com/pelican-dev/wings/releases/download/v1.0.0-beta29/wings_linux_amd64 -o /usr/local/bin/wings
sudo chmod +x /usr/local/bin/wings
wings version  # verify (no --version flag)
```

## Step 2: Configure Wings

Get a panel-generated token from **Admin → Nodes → Node #1 → Configuration → Token**, then:

```bash
sudo mkdir -p /etc/pelican
sudo wings configure --panel-url https://panel.saturia.codes --token <papp_...> --node 1 --allow-insecure
```

This writes `/etc/pelican/config.yml` with:
- API token + panel URL
- FQDN (defaults to `node.saturia.codes` — will be changed to `localhost` later)
- Ports: SFTP 2022, API 8080
- Docker network: `pelican_nw`

**Gotcha:** `wings configure` panics if `/etc/pelican` doesn't exist — create it first.

## Step 3: systemd unit

```ini
# /etc/systemd/system/wings.service
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

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now wings
```

## Step 4: Verify

```bash
sudo systemctl status wings  # active (running)
sudo journalctl -u wings -n 30  # "processing servers returned by the API total_configs=0", "network created successfully", "sftp server listening for connections listen=0.0.0.0:2022"
docker network ls | grep pelican  # pelican_nw
```

## Step 5: Fix panel node connection (CRITICAL)

Panel node config defaults to `https://node.saturia.codes:443` but Wings listens `0.0.0.0:8080` (HTTP). Panel can't reach Wings → node shows offline/red.

**Fix:** Set node to `http://localhost:8080` (internal, bypasses DNS/tunnel):

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

Verify panel → Nodes → Node #1 shows green/online.

## Step 6: Move Docker data-root to data disk

Root disk (`/`) is only 29GB. Every game server image/container lands in `/var/lib/docker` otherwise. Relocate to `/var/www/pelican/docker`:

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

## Step 7: Move Wings data directories to data disk

Wings config defaults to `/var/lib/pelican/*` (root disk) for `root_directory`, `data`, `archive_directory`, `backup_directory`, `log_directory`. Relocate to `/var/www/pelican/wings-data`:

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

## Troubleshooting

See `references/pelican-node-connection-debug.md` for the full diagnosis chain.

### Quick checks
```bash
# Wings running?
sudo systemctl is-active wings

# Panel node DB config correct?
cd /var/www/pelican && sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
use App\Models\Node;
\$n = Node::find(1);
echo \$n->fqdn . ' ' . \$n->scheme . ':' . \$n->daemon_listen . PHP_EOL;
"
# Fallback if tinker fails:
sudo mariadb -e "USE pelican; SELECT fqdn, scheme, daemon_listen FROM nodes WHERE id=1;"

# Panel can reach Wings locally?
curl -s -o /dev/null -w "wings_api=%{http_code}\n" http://localhost:8080/

# CF tunnel routing panel correctly?
curl -s -o /dev/null -w "panel=%{http_code}\n" https://panel.saturia.codes/login

# Wings recent errors?
sudo journalctl -u wings --no-pager -n 20 | tail -10
```

### Common issues
- **"configured subnet conflicts with existing network, letting Docker auto-assign subnet..."** — normal, harmless
- **Panel 502 from CF tunnel** — check `sudo journalctl -u cloudflared --no-pager -n 30 | grep -iE "panel.saturia|8088|8080|origin|refused"` for wrong port
- **Node offline in panel** — 90% of the time it's `fqdn`/`scheme` mismatch (see Step 5)
- **mkdir(): Permission denied in panel** — `sudo chown -R www-data:www-data /var/www/pelican/public /var/www/pelican/plugins`
- **Remotely-managed tunnel gotcha** — the saturia VPS tunnel (`a9521ff9-...`) is remotely-managed (config pushed from CF API, not local file). Editing `/etc/cloudflared/config.yml` alone does NOT add routes. You MUST add hostnames via CF Zero Trust dashboard → Tunnels → Public Hostnames → Add, OR via `cloudflared tunnel route dns <tunnel-id> <hostname>`. Local config edits are validated but not pushed.
