# Calagopus (game server panel) — deploy + theming

Calagopus is a Rust game-server panel (Pterodactyl alternative). Official docs: https://calagopus.com/docs/

## Deploy (All-in-One Docker, single node)

### Prerequisites
- Docker installed: `curl -fsSL https://get.docker.com | sudo sh && sudo systemctl enable --now docker`
- Domain with DNS access (Cloudflare Tunnel recommended for VPS without open inbound ports)
- 2GB+ RAM, 10GB+ disk

### Installation

1. **Install Docker** (if not present):
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo systemctl enable --now docker
   docker --version
   ```

2. **Generate compose file** (creates `compose.yml` with random encryption key):
   ```bash
   mkdir -p ~/calagopus-panel && cd ~/calagopus-panel
   curl -sSL https://calagopus.com/install/aio.sh | bash
   ```
   The script prints the `APP_ENCRYPTION_KEY` once — save it (needed for backups/migrations).

3. **Start containers**:
   ```bash
   docker compose up -d
   docker compose ps  # verify web, db, cache all running
   ```
   Panel listens on **port 8000** (HTTP), Wings SFTP on **port 2022**.

4. **Verify locally**:
   ```bash
   curl -I http://localhost:8000  # expect HTTP/1.1 200 OK
   ```

### Cloudflare Tunnel setup (for VPS without open ports)

**Option A: Add hostname to existing tunnel**

```bash
# Get tunnel ID
TUNNEL_ID=$(awk '/^tunnel:/ {print $2}' /etc/cloudflared/config.yml)

# Add DNS route (registers hostname + creates CNAME atomically)
cloudflared tunnel route dns $TUNNEL_ID panel2.saturia.codes

# Add ingress to config
sudo tee -a /etc/cloudflared/config.yml <<EOF
  - hostname: panel2.saturia.codes
    service: http://localhost:8000
EOF

# Restart tunnel
sudo systemctl restart cloudflared
```

**Option B: Create new tunnel**

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# Login (opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create calagopus-panel
# Save the tunnel ID from output

# Create config
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml <<EOF
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: panel2.saturia.codes
    service: http://localhost:8000
  - service: http_status:404
EOF

# Add DNS route
cloudflared tunnel route dns <tunnel-id> panel2.saturia.codes

# Install as systemd service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

**Verify tunnel**:
```bash
curl -I https://panel2.saturia.codes  # expect HTTP/2 200
```

## Initial setup (OOBE wizard)

Open the panel URL in a browser. The Out Of Box Experience wizard guides through:

1. **Admin account** — email, username, password
2. **Panel settings** — site name, language, timezone
3. **Email** (optional) — SMTP config for notifications
4. **Node configuration** (AIO mode auto-fills)
5. **Done** — redirects to admin dashboard

**OOBE gotchas**:
- **SFTP Host** must be ≥3 chars or validation fails (`sftp_host: length is lower than 3`)
- **Allocations port range** must NOT collide with existing services on the host (check with `ss -tlnp`)
- Node config is pre-filled by AIO mode; leave defaults unless customizing

## Cloudflared tunnel route DNS workflow

The `cloudflared tunnel route dns <tunnel-id> <hostname>` command does TWO things atomically:

1. **Registers the hostname with the tunnel** (adds it to the tunnel's allowed hostname list in Cloudflare's API)
2. **Creates a DNS CNAME record** `<hostname>` → `<tunnel-id>.cfargotunnel.com` with `proxied=true`

This is why adding a manual CNAME in the dashboard (without registering via `route dns` or Zero Trust UI) results in 404 — the tunnel rejects hostnames not in its allowlist.

**When to use `route dns`**:
- You have `cloudflared` installed with valid credentials (Origin CA cert or API token)
- The tunnel is **locally-managed** (config read from `/etc/cloudflared/config.yml`)
- You want one-command hostname registration + DNS creation

**When to use Zero Trust dashboard**:
- The tunnel is **remotely-managed** (config pushed from Cloudflare API)
- You don't have cloudflared/credentials on the host
- You need to edit hostname → service mappings via UI

**How to check if a tunnel is locally vs remotely managed**:
- Locally-managed: `config.yml` ingress rules are respected, logs show "Using config from /etc/cloudflared/config.yml"
- Remotely-managed: logs show "Updated to new configuration ... version=N", config comes from API

## Troubleshooting

### Panel returns 502/504 via tunnel

- Check containers: `docker compose ps` (all should be Up)
- Check panel logs: `docker compose logs web --tail=50`
- Verify local access: `curl -I http://localhost:8000` (should return 200)
- Check tunnel config: `cat /etc/cloudflared/config.yml` (hostname + service correct?)
- Restart tunnel: `sudo systemctl restart cloudflared`

### "Database connection failed" on first start

- The `db` container takes ~10-15s to initialize on first run
- Check health: `docker compose ps` (db should show "healthy")
- If `starting`, wait and retry
- If `unhealthy`, check logs: `docker compose logs db`

### Forgot admin password

```bash
# Enter the web container
docker compose exec web /bin/sh

# Reset password (replace <email> and <new-password>)
panel-rs user reset-password --email <email> --password <new-password>
```

## Backup and restore

### Backup

```bash
cd ~/calagopus-panel
docker compose down
tar -czf calagopus-backup-$(date +%Y%m%d).tar.gz compose.yml data/ logs/
docker compose up -d
```

### Restore

```bash
tar -xzf calagopus-backup-YYYYMMDD.tar.gz -C ~/calagopus-panel-restore
cd ~/calagopus-panel-restore
docker compose up -d
```

## Updating Calagopus

```bash
cd ~/calagopus-panel
docker compose pull
docker compose up -d
docker compose logs web --tail=30
```

## Permanent server-side theming (nginx CSS injection)

Calagopus has no custom-CSS env var and the frontend is bundled in the container. Inject CSS via nginx reverse proxy:

1. `sudo apt-get install -y nginx`
2. Theme CSS at `/var/www/calagopus-theme/theme.css` (override `--mantine-color-*` vars; Calagopus uses Mantine)
3. nginx site (port 80) proxies `127.0.0.1:8000` and injects the CSS:
   ```nginx
   server {
     listen 80;
     location = /saturia-theme.css { alias /var/www/calagopus-theme/theme.css; add_header Content-Type text/css; }
     location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
       sub_filter '</head>' '<link rel="stylesheet" href="/saturia-theme.css"></head>';
       sub_filter_once on;
     }
   }
   ```
4. Disable default site, enable, test: `sudo rm /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl enable --now nginx`
5. Point tunnel ingress to `http://localhost:80` (not 8000) and restart cloudflared
6. To update theme: edit CSS, `sudo systemctl reload nginx` (no panel restart needed)
