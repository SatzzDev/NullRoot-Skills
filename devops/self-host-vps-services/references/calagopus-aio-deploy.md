# Calagopus Panel All-in-One Deployment

Calagopus is a game server panel (fork/alternative to Pterodactyl/Pelican). This reference covers deploying the **All-in-One (AIO)** Docker image, which bundles the Panel and Wings (node daemon) in a single container.

## When to Use

- Single-node game server panel setup (Panel + Wings on the same host)
- Quick panel deployment without separate Wings configuration
- Docker-based game server hosting behind Cloudflare Tunnel

## Prerequisites

- VPS with Docker installed (Ubuntu 24.04+ recommended)
- Root SSH access or sudo privileges
- Cloudflare Tunnel credentials (existing tunnel or ability to create one)
- Domain/subdomain for panel access (e.g., `panel2.saturia.codes`)

## Installation Sequence

### 1. Install Docker

Run Docker's official installation script:

```bash
curl -sSL https://get.docker.com/ | CHANNEL=stable bash
```

Verify installation:

```bash
docker --version
docker compose version
```

### 2. Download Calagopus AIO Compose Stack

Create directory and download the AIO compose file:

```bash
mkdir -p ~/calagopus-panel
cd ~/calagopus-panel

curl -o compose.yml https://raw.githubusercontent.com/calagopus/panel/refs/heads/main/compose.aio.yml
```

For extension support (larger image with build tools), use `compose.heavy.aio.yml` instead.

### 3. Create Wings Configuration File

**MANDATORY before first start.** The compose file mounts `./wings-config.yml` as a file. If it doesn't exist, Docker creates it as a directory → container breaks.

```bash
echo 'app_name: Calagopus' > wings-config.yml
```

The AIO container populates this file on first startup. You only need to ensure it exists.

### 4. Generate Encryption Key

The `APP_ENCRYPTION_KEY` in compose.yml must be a random 32-character alphanumeric string. Generate and replace:

```bash
RANDOM_STRING=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
sed -i -e "s/CHANGEME/$RANDOM_STRING/g" compose.yml
```

Verify the replacement:

```bash
grep APP_ENCRYPTION_KEY compose.yml
```

Should show: `APP_ENCRYPTION_KEY=<32-char-random-string>`

### 5. Start Calagopus Containers

```bash
docker compose up -d
```

Wait 10-15 seconds for containers to initialize, then check status:

```bash
docker compose ps
```

Expected output:

```
NAME                      STATUS                   PORTS
calagopus-panel-cache-1   Up N seconds             6379/tcp
calagopus-panel-db-1      Up N seconds (healthy)   5432/tcp
calagopus-panel-web-1     Up N seconds             0.0.0.0:2022->2022/tcp, 0.0.0.0:8000->8000/tcp
```

The panel listens on **port 8000** (HTTP) and **port 2022** (SFTP for game servers).

### 6. Verify Local Access

Test the panel responds locally:

```bash
curl -I http://localhost:8000
```

Expect: `HTTP/1.1 200 OK`

### 7. Configure Cloudflare Tunnel

#### Option A: Existing Tunnel (Recommended)

If a Cloudflare Tunnel is already running on this VPS:

1. Check existing tunnel ID and config:

```bash
sudo cat /etc/cloudflared/config.yml
```

2. Add ingress rule for the panel (before the final `http_status:404` catch-all):

```yaml
ingress:
  - hostname: panel2.saturia.codes
    service: http://localhost:8000
  # ... other hostnames ...
  - service: http_status:404
```

3. Restart cloudflared:

```bash
sudo systemctl restart cloudflared
```

4. Add DNS route:

```bash
cloudflared tunnel route dns <tunnel-id> panel2.saturia.codes
```

Replace `<tunnel-id>` with your tunnel UUID (from `cloudflared tunnel list` or config.yml `tunnel:` line).

#### Option B: New Tunnel

If no tunnel exists, install cloudflared first:

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

Authenticate with Cloudflare:

```bash
cloudflared tunnel login
```

Create tunnel:

```bash
cloudflared tunnel create calagopus-panel
```

Create config file `/etc/cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id-from-create-output>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: panel2.saturia.codes
    service: http://localhost:8000
  - service: http_status:404
```

Install and start as systemd service:

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Add DNS route:

```bash
cloudflared tunnel route dns <tunnel-id> panel2.saturia.codes
```

### 8. Verify Public Access

Wait 5-10 seconds for DNS propagation, then test:

```bash
curl -I https://panel2.saturia.codes
```

Expect: `HTTP/2 200` with Cloudflare headers (`cf-ray`, `server: cloudflare`).

### 9. Complete OOBE Setup

Open `https://panel2.saturia.codes` in a browser. You'll see the **Out Of Box Experience (OOBE)** setup screen:

1. Create the first admin user (email, username, password)
2. Configure panel settings (panel name, locale, timezone)
3. Set up the bundled Wings node (AIO mode auto-registers it)

## Key Files and Paths

- **Compose file**: `~/calagopus-panel/compose.yml`
- **Panel data**: `~/calagopus-panel/data/` (SQLite DB, uploads, cache)
- **Logs**: `~/calagopus-panel/logs/`
- **Wings config**: `~/calagopus-panel/wings-config.yml` (auto-populated on first run)
- **Postgres data**: `~/calagopus-panel/postgres/` (via pgautoupgrade:18-alpine image)
- **Redis data**: `~/calagopus-panel/cache/` (via valkey:latest image)
- **Wings data**: `/var/lib/calagopus-wings/` (server files, backups, diffs)
- **Wings config dir**: `/etc/calagopus-wings/` (mounted from host)

## Service Management

All services are managed via docker compose from the `~/calagopus-panel` directory:

```bash
# View status
docker compose ps

# View logs (all services)
docker compose logs --tail=50

# View logs (specific service)
docker compose logs --tail=50 web

# Restart panel
docker compose restart web

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Update to latest image
docker compose pull
docker compose up -d
```

## Common Pitfalls

### Container Fails to Start: "wings-config.yml is a directory"

**Cause**: The `wings-config.yml` file was not created before first `docker compose up`. Docker created it as a directory.

**Fix**:

```bash
cd ~/calagopus-panel
docker compose down
rm -rf wings-config.yml  # Remove the directory
echo 'app_name: Calagopus' > wings-config.yml  # Create as file
docker compose up -d
```

### Panel Returns 502/504 via Tunnel

**Diagnosis**:

1. Check panel is running locally: `curl -I http://localhost:8000`
2. Check cloudflared is running: `sudo systemctl status cloudflared`
3. Check cloudflared logs: `sudo journalctl -u cloudflared -n 50 | grep -iE "error|refused|timeout"`
4. Verify ingress rule targets `http://localhost:8000` (NOT `https`, NOT a different port)

### DNS Resolves But Returns 404 from Tunnel

**Cause**: DNS CNAME exists but hostname is not registered with the tunnel itself.

**Fix**: Use `cloudflared tunnel route dns <tunnel-id> <hostname>` to register the hostname. A manual CNAME alone is NOT sufficient.

## Official Documentation

- Calagopus Docs: https://calagopus.com/docs/
- Panel Installation: https://calagopus.com/docs/panel/installation/docker
- GitHub: https://github.com/calagopus/panel