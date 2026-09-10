---
name: calagopus-panel-administration
description: Use when administering Calagopus Panel/Wings nodes.
---

# Calagopus Panel & Wings Administration

Calagopus is a Rust-based game server panel (successor to Pelican/Pterodactyl). This skill covers Panel deployment, Wings node setup, Cloudflare Tunnel routing for HTTPS access, and troubleshooting node connection failures.

## Architecture Overview

**Calagopus Panel** (Rust backend + frontend) runs as Docker Compose with:
- `web` container — Panel backend (port 8000) + built-in Wings (localhost port varies, e.g. 64332)
- `db` container — PostgreSQL
- `cache` container — Valkey (Redis fork)

**Calagopus Wings** standalone — Rust daemon managing game server containers, can run on separate VPS nodes. Communicates with Panel via token-based auth.

**Two node types:**
1. **Integrated Node** — Wings built-in to Panel container, accessed via Panel's proxy at `https://panel-domain.com/wings-proxy/<node-id>/...`
2. **Server Node** — Standalone Wings binary on external VPS, accessed via direct URL (internal) and Public URL (HTTPS via Cloudflare Tunnel)

## Panel Installation (Docker Compose AIO)

Calagopus provides an all-in-one Docker Compose installer:

```bash
# Install Docker if needed
curl -fsSL https://get.docker.com | sh

# Download and run Calagopus installer
curl -sSL https://install.calagopus.dev | bash

# Installer prompts for:
# - Panel domain (e.g., panel.example.com)
# - Admin email
# - Admin password
# - Database credentials

cd ~/calagopus-panel
docker compose up -d
```

Panel binds to `0.0.0.0:8000` and `0.0.0.0:2022` (SFTP). Access via `http://<vps-ip>:8000` initially, then set up Cloudflare Tunnel for HTTPS.

### Important: APP_URL Configuration

Panel's `APP_URL` environment variable **must match the domain used to access it**. Set it in `compose.yml`:

```yaml
services:
  web:
    environment:
      - APP_URL=https://panel.example.com
      - PORT=8000
      # ...
```

After changing `APP_URL`, restart Panel:
```bash
cd ~/calagopus-panel
docker compose restart web
```

**Why this matters:** Panel uses `APP_URL` to:
- Generate CORS `Access-Control-Allow-Origin` headers (frontend browser requests fail if origin doesn't match)
- Build Wings proxy URLs for Integrated Node
- Validate WebSocket connections

Mismatch symptoms: "Warning: The application URL does not match the current URL" banner, or CORS errors in browser console.

## Cloudflare Tunnel Setup for Panel

Expose Panel via HTTPS without opening firewall ports:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate with Cloudflare
cloudflared tunnel login
# Opens browser to authorize, saves cert.pem to ~/.cloudflared/

# Create tunnel
cloudflared tunnel create panel-tunnel
# Returns tunnel ID (e.g., a9521ff9-...)

# Create config file
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: panel.example.com
    service: http://localhost:8000
  - hostname: api.example.com
    service: http://localhost:4000
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns <tunnel-id> panel.example.com
cloudflared tunnel route dns <tunnel-id> api.example.com

# Install as systemd service
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

After tunnel is live, update Panel's `APP_URL` to match the public domain (`https://panel.example.com`).

## Standalone Wings Installation (External Node)

### 1. Install Wings Binary

```bash
# Download latest Wings
curl -L https://github.com/calagopus/wings/releases/latest/download/wings-linux-amd64 -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings

# Verify
wings --version
```

### 2. Create Node in Panel

1. Go to Panel admin → **Nodes** → **Create**
2. Fill in:
   - **Name:** e.g., "Azure Node"
   - **Location:** Select or create location
   - **URL:** `http://<vps-internal-ip>:8080` (backend Panel → Wings direct connection)
   - **Public URL:** `https://wings.example.com` (frontend browser → Wings via Cloudflare Tunnel)
3. Click **Create** → Panel generates a **join token**

### 3. Configure Wings with Join Token

Panel provides a join-data string (base64 encoded). Decode it manually and create config:

```bash
# Decode join-data
echo "<join-data-string>" | base64 -d > /tmp/join.yml
cat /tmp/join.yml
```

Example decoded join-data:
```yaml
uuid: d446edd5-42d8-4ce3-b4ce-cc5df87c250d
token_id: YiYhdphwmPwlWb3j
token: 4KIkHR3JZROS8mRflwouZtoUxlvtKmWt68otWACOhJep5OxZB5skyFEGBS8QZqLW
api:
  port: 8080
  disable_openapi_docs: true
  upload_limit_mib: 100
sftp:
  bind_port: 2022
remote: https://panel.example.com
```

Create Wings config:
```bash
mkdir -p /etc/calagopus-wings
cat > /etc/calagopus-wings/config.yml <<EOF
uuid: <uuid-from-join-data>
token_id: <token_id>
token: <token>
api:
  port: 8080
  disable_openapi_docs: true
  upload_limit_mib: 100
sftp:
  bind_port: 2022
remote: https://panel.example.com
EOF
```

### 4. Test Wings in Foreground

```bash
wings --config /etc/calagopus-wings/config.yml
```

Should see:
```
[INFO] Wings v1.2.0 starting
[INFO] Connecting to panel at https://panel.example.com
[INFO] API server listening on 0.0.0.0:8080
[INFO] SFTP server listening on 0.0.0.0:2022
```

Press Ctrl+C to stop.

### 5. Install Wings as Systemd Service

```bash
cat > /etc/systemd/system/wings.service <<EOF
[Unit]
Description=Calagopus Wings Daemon
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/calagopus-wings
ExecStart=/usr/local/bin/wings --config /etc/calagopus-wings/config.yml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wings
systemctl start wings
systemctl status wings
```

### 6. Expose Wings via Cloudflare Tunnel

Frontend (browser) needs HTTPS access to Wings. Add Wings to tunnel config:

```bash
# Edit tunnel config
vim ~/.cloudflared/config.yml
```

Add ingress:
```yaml
ingress:
  - hostname: wings.example.com
    service: http://localhost:8080
  # ... other hostnames
  - service: http_status:404
```

Route DNS and restart:
```bash
cloudflared tunnel route dns <tunnel-id> wings.example.com
systemctl restart cloudflared
```

### 7. Update Node Public URL in Panel

Go to Panel admin → **Nodes** → select the node → **Update**:
- **Public URL:** `https://wings.example.com`

Panel database update (if UI doesn't save):
```bash
docker compose -f ~/calagopus-panel/compose.yml exec -T db psql -U panel -d panel -c "UPDATE nodes SET public_url = 'https://wings.example.com' WHERE name = 'Azure Node';"
```

## Troubleshooting Node Connection Failures

### Symptom: "Backend to Wings" Connection Failed

Panel backend cannot reach Wings at the configured **URL** (internal address).

**Check:**
```bash
# From Panel VPS, test Wings connectivity
curl -v http://<wings-vps-ip>:8080/

# Should return 404 with header:
# access-control-allow-origin: https://panel.example.com
```

**Common causes:**
1. Wings not running: `systemctl status wings`
2. Firewall blocking port 8080 between Panel and Wings VPS
3. Wrong IP in node's **URL** field (must be reachable from Panel VPS)
4. Wings config `api.port` doesn't match URL port

**Fix:** Verify Panel VPS can reach `http://<wings-ip>:8080` directly. If behind NAT/firewall, ensure private network or VPN between VPSs.

### Symptom: "Frontend to Wings" Connection Failed (CORS Error)

Browser console shows:
```
Access to XMLHttpRequest at 'https://panel.example.com/wings-proxy/...' from origin 'https://panel2.example.com' has been blocked by CORS policy:
The 'Access-Control-Allow-Origin' header has a value 'http://localhost:8000' that is not equal to the supplied origin.
```

**Root cause:** Panel's `APP_URL` doesn't match the domain used to access Panel.

**Fix:**
1. Check current `APP_URL`:
   ```bash
   grep APP_URL ~/calagopus-panel/compose.yml
   ```
2. Update to match access domain:
   ```bash
   sed -i 's|APP_URL=https://panel.example.com|APP_URL=https://panel2.example.com|' ~/calagopus-panel/compose.yml
   docker compose -f ~/calagopus-panel/compose.yml restart web
   ```

### Symptom: Node Shows Offline / "route not found"

Node appears in Panel dashboard with red heart icon or "Offline" status.

**Check Wings logs:**
```bash
journalctl -u wings -n 50 --no-pager
```

**Common errors:**

1. **"invalid authorization token"**
   - Token mismatch between Panel database and Wings config
   - Regenerate node in Panel and reconfigure Wings with new join token

2. **"connection refused"**
   - Wings process not running: `systemctl restart wings`
   - Docker daemon not running: `systemctl start docker`

3. **"404 route not found"**
   - Wings is running but Panel's API path is wrong
   - Check node's **URL** field in Panel admin (must be `http://<ip>:8080`, no trailing slash)

### Symptom: Integrated Node Offline

Integrated Node (built-in Wings in Panel container) shows offline.

**Check:**
```bash
# Integrated Node has no public_url initially
docker compose -f ~/calagopus-panel/compose.yml exec -T db psql -U panel -d panel -c "SELECT name, url, public_url FROM nodes;"
```

Integrated Node **must have `public_url`** set to Panel's domain for browser access:
```bash
docker compose -f ~/calagopus-panel/compose.yml exec -T db psql -U panel -d panel -c "UPDATE nodes SET public_url = 'https://panel.example.com' WHERE name = 'Integrated Node';"
docker compose -f ~/calagopus-panel/compose.yml restart web
```

**Why:** Frontend (browser) accesses Integrated Node via Panel's `/wings-proxy/<node-id>/` endpoint, which requires `public_url` to build correct CORS headers.

## Cloudflare Tunnel Best Practices

### Reusing Existing Tunnels

Instead of creating a new tunnel for every service, **reuse an existing tunnel** by adding ingress entries:

```bash
# List existing tunnels
cloudflared tunnel list

# Edit existing tunnel config
vim ~/.cloudflared/config.yml
```

Add new hostname:
```yaml
ingress:
  - hostname: panel.example.com
    service: http://localhost:8000
  - hostname: wings.example.com  # NEW
    service: http://localhost:8080
  - service: http_status:404
```

Route DNS and restart:
```bash
cloudflared tunnel route dns <existing-tunnel-id> wings.example.com
systemctl restart cloudflared
```

**Why:** Each tunnel consumes a Cloudflare Tunnel slot (limit 1000 per account, but cleaner to reuse). One tunnel can route many hostnames.

### Removing a Hostname from an Existing Tunnel

When consolidating domains or retiring a subdomain (e.g., replacing `panel2.example.com` with `panel.example.com`):

1. **Remove from tunnel config** — edit `/etc/cloudflared/config.yml` or `~/.cloudflared/config.yml` and delete the hostname's ingress entry:
   ```bash
   # Before
   ingress:
     - hostname: panel.example.com
       service: http://localhost:8000
     - hostname: panel2.example.com  # REMOVE THIS
       service: http://localhost:8000
     - service: http_status:404
   
   # After
   ingress:
     - hostname: panel.example.com
       service: http://localhost:8000
     - service: http_status:404
   ```

2. **Restart cloudflared** to apply changes:
   ```bash
   systemctl restart cloudflared
   ```

3. **Verify tunnel logs** confirm the old hostname is gone:
   ```bash
   journalctl -u cloudflared -n 20 --no-pager | grep hostname
   ```

4. **DNS cleanup** (optional but recommended) — the CNAME record for the old hostname still exists and will resolve, returning HTTP 404 from the tunnel's fallback rule. Delete the DNS record via Cloudflare dashboard or API to fully retire the domain.

**Important:** If using `APP_URL` in Panel config, update it to match the remaining domain before removing the old hostname from the tunnel. Otherwise Panel will generate CORS headers for the wrong origin and frontend requests will fail.

### Tunnel Health Check

```bash
# Check tunnel status
systemctl status cloudflared

# View active connections
cloudflared tunnel info <tunnel-id>

# Check logs
journalctl -u cloudflared -n 50 --no-pager
```

Healthy output:
```
[INFO] Connection established to Cloudflare edge
[INFO] Serving hostname panel.example.com -> http://localhost:8000
```

## Migration: Pelican Panel → Calagopus Panel

Calagopus is a rewrite of Pelican, not a direct migration path. **Data migration is not supported** — Calagopus uses different database schema.

**Recommended approach:**
1. Install Calagopus Panel on new VPS
2. Install Calagopus Wings on node VPSs (can coexist with Pelican Wings temporarily)
3. Manually recreate servers in Calagopus Panel
4. Stop Pelican Wings and remove old installations

### Uninstall Pelican Wings

```bash
# Stop and disable Pelican Wings
sudo systemctl stop wings
sudo systemctl disable wings

# Remove binary
sudo rm /usr/local/bin/wings

# Remove config and data
sudo rm -rf /etc/pelican
sudo rm -rf /var/lib/pelican
sudo rm -rf /var/lib/pterodactyl  # if migrated from Pterodactyl

# Remove systemd unit
sudo rm /etc/systemd/system/wings.service
sudo systemctl daemon-reload
```

### Uninstall Pelican Panel

```bash
# Stop web server
sudo systemctl stop nginx  # or apache2
sudo systemctl disable nginx

# Remove Panel files
sudo rm -rf /var/www/pelican

# Stop queue worker
sudo systemctl stop pelican
sudo systemctl disable pelican
sudo rm /etc/systemd/system/pelican.service
sudo systemctl daemon-reload

# Remove database (optional, backup first)
mysqldump -u root -p pelican > pelican_backup.sql
mysql -u root -p -e "DROP DATABASE pelican;"
```

## Server State Management & Crash Detection

### How Wings Determines "Running" Status

Wings tracks server state by monitoring Docker container status and process lifecycle. A server transitions from "Starting" to "Running" when:

1. **Container process stays alive** past the crash detection timeout (default 60 seconds)
2. **Startup done regex matches** (if configured in the egg)

Crash detection config (Wings `config.yml`):
```yaml
system:
  crash_detection:
    enabled: true
    detect_clean_exit_as_crash: true
    timeout: 60  # seconds
```

Wings considers a server **crashed** if:
- Process exits within 60s of start → auto-restart
- Clean exit (`exit 0`) with `detect_clean_exit_as_crash: true` → also treated as crash

### Startup Done Regex (Egg Configuration)

Eggs can define a **startup done regex** pattern that Wings matches against container stdout/stderr logs. Server remains in "Starting" state until:
- The regex matches a log line, OR
- Crash detection timeout expires without the process exiting

**Example egg startup done patterns:**
```regex
^BOT_RUNNING$          # Exact line match
^Server listening on   # Prefix match
^Ready!$              # Common for Discord bots
```

**To configure startup done regex:**
1. Admin → Eggs → select egg → Configuration tab
2. Find field **Startup Done Regex** or **Done Marker**
3. Enter regex that matches a log line your server prints when ready
4. Update egg → restart affected servers

**If no regex is set:** Wings waits the full 60s timeout, then marks server as "Running" if the process is still alive.

### Troubleshooting: Server Stuck in "Starting"

**Symptom:** Server container is running for 5+ minutes, logs show bot is active, but Panel dashboard shows "Starting" status.

**Root causes:**

1. **Startup done regex doesn't match any log output**
   - Check egg config: Admin → Eggs → Configuration → Startup Done Regex
   - Check server logs for actual output
   - Update regex to match what your bot actually prints, e.g.:
     ```regex
     BOT_RUNNING
     ```
   - Restart server after updating egg

2. **Process exits immediately after printing logs**
   - Bot script must be **long-running** (not just print and exit)
   - Example bad code:
     ```javascript
     console.log("BOT_RUNNING");
     // script ends, container exits
     ```
   - Example correct code:
     ```javascript
     console.log("BOT_RUNNING");
     setInterval(() => {}, 1000); // keep alive
     // or use event loop (Discord client, HTTP server, etc.)
     ```

3. **Crash detection timeout not yet elapsed**
   - Wait full 60 seconds after container start
   - Check Wings logs: `journalctl -u wings -n 50 --no-pager`

**Verify container state:**
```bash
# Check if container is actually running
docker ps --filter "name=<server-uuid>" --format "{{.Status}}"

# Check container logs
docker logs <server-uuid> --tail 50
```

If container shows `Up X minutes` but Panel shows "Starting", the issue is startup done regex mismatch or missing `public_url` on the node.

## Common Pitfalls

### Startup Done Regex Mismatch Keeps Server in "Starting" State

Egg's startup done regex must match actual log output from the server process. If your bot prints `console.log("BOT_RUNNING")` but egg regex is `^Ready!$`, Wings never detects startup completion. Server will transition to "Running" after 60s timeout expires, but this delay confuses users who see active logs yet status stuck in "Starting". Update egg regex to match your bot's actual ready message — use literal string match without anchors (`BOT_RUNNING`) unless you need exact line match (`^BOT_RUNNING$`). Test regex against actual log output before deploying to production servers.

### APP_URL Mismatch Causes CORS Failures

Panel's `APP_URL` must match the domain used to access Panel. If Panel is accessible via multiple domains (e.g., `panel.example.com` and `panel2.example.com`), pick one as primary and update `APP_URL` to match. Wings proxy requests will fail CORS checks if origin doesn't match `APP_URL` — the backend generates `Access-Control-Allow-Origin` headers based on `APP_URL`, not the request's `Host` header.

**When changing `APP_URL`:** Update node `public_url` values in the database to match, especially for Integrated Node. After changing Panel's domain from `panel2.example.com` to `panel.example.com`, run:

```bash
cd ~/calagopus-panel
docker compose exec -T db psql -U panel -d panel -c "UPDATE nodes SET public_url = 'https://panel.example.com' WHERE name = 'Integrated Node';"
docker compose restart web
```

Verify all nodes show correct `public_url`:
```bash
docker compose exec -T db psql -U panel -d panel -c "SELECT name, public_url FROM nodes;"
```

Mismatched `public_url` causes node connection failures with CORS errors in browser console.

### Integrated Node Requires public_url

Unlike standalone Wings nodes, Integrated Node's `public_url` is **not set by default**. Panel dashboard will show Integrated Node as offline until `public_url` is manually set to Panel's domain. Update via database query and restart Panel container.

### Cloudflare Tunnel DNS Record Conflicts

If a hostname (e.g., `panel.example.com`) is already routed to an old tunnel, `cloudflared tunnel route dns` will fail silently or overwrite the existing CNAME. Before routing a hostname to a new tunnel, **remove it from the old tunnel's config** and restart the old tunnel's cloudflared service. Verify via `dig panel.example.com` — CNAME should point to the correct tunnel ID (`<tunnel-id>.cfargotunnel.com`).

### Wings Token Mismatch After Panel Database Reset

If Panel database is wiped or restored from backup, node tokens change. Wings will fail with "invalid authorization token". **Regenerate join token** from Panel admin and reconfigure Wings with the new token — old tokens are cryptographically bound to database records and cannot be reused.

### Firewall Blocks Internal Panel ↔ Wings Communication

Cloudflare Tunnel only handles **frontend (browser) → Wings** traffic. **Panel backend → Wings** uses the internal **URL** (e.g., `http://20.212.168.96:8080`), which must be directly reachable from Panel VPS. If Wings and Panel are on separate VPSs with firewall/NAT between them, either:
- Allow port 8080 inbound on Wings VPS from Panel VPS IP
- Use VPN/private network between VPSs
- Run Wings on same VPS as Panel (less common for multi-node setups)

Test reachability: `curl -v http://<wings-ip>:8080/` from Panel VPS should return 404 with CORS header.

## User Preferences

### Language: Indonesian for Infrastructure Tasks

When working on infrastructure/DevOps tasks (VPS management, Wings setup, troubleshooting), respond in **Indonesian** (Bahasa Indonesia). The user prefers concise Indonesian status updates during system administration work. Keep technical terms in English (e.g., "Wings", "Panel", "CORS", "tunnel") but surrounding explanations in Indonesian.

### Response Style: Action-First (Critical)

For troubleshooting and system administration:
- **Execute commands immediately**, report results — user explicitly prefers "selalu utamakan beraksi" (always prioritize action over explanation)
- **Skip verbose explanations** unless something fails
- Use short status updates: "Wings sudah restart", "Config sudah diupdate", "Node online"
- Report final status with verification (e.g., "✅ Wings Azure — Online")
- Do NOT ask "want me to proceed?" for standard operations — act first, report after
- Only ask permission for destructive operations (data deletion, service removal affecting dependencies)

## References

- Official docs: https://docs.calagopus.dev (as of Sept 2026, limited documentation)
- GitHub: https://github.com/calagopus/panel
- Discord: Calagopus community server (linked from GitHub README)
