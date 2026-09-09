# Pelican Panel to Calagopus Wings Secondary Node Migration

## When to Use This

You have:
- **Source VPS**: running Pelican Panel + Wings (control plane + node 1)
- **Target VPS**: running Calagopus Panel AIO (control plane + node 1)
- **Goal**: repurpose Source VPS as a **standalone Wings node** (node 2) for the Target Calagopus Panel

This workflow removes Pelican Panel entirely and installs Calagopus Wings standalone.

## Prerequisites

- Target Calagopus Panel must already be deployed and accessible (e.g., `panel2.saturia.codes`)
- Source VPS must have Docker installed (Wings requires Docker)
- Admin access to both VPSes and the Calagopus Panel

## Migration Steps

### 1. Stop and Disable Pelican Services

```bash
# Stop Wings
sudo systemctl stop wings
sudo systemctl disable wings

# Stop Nginx (if Panel is served by it)
sudo systemctl stop nginx
sudo systemctl disable nginx

# Verify services are stopped
systemctl status wings --no-pager
systemctl status nginx --no-pager
```

### 2. Remove Pelican Panel and Wings Files

```bash
# Remove Panel files
sudo rm -rf /var/www/pelican

# Remove Wings binary
sudo rm -f /usr/local/bin/wings

# Verify removal
ls -la /var/www/
which wings  # should return nothing
```

**Important**: Do NOT remove `/var/lib/pelican/` or Docker volumes if you want to preserve existing game server data. Calagopus Wings can potentially reuse existing Docker containers/volumes, but this requires manual container migration (not covered here).

### 3. Install Calagopus Wings Binary

```bash
# Download latest Wings release (check https://github.com/calagopus/wings/releases)
sudo curl -L "https://github.com/calagopus/wings/releases/latest/download/wings-rs-$(uname -m)-linux" -o /usr/local/bin/wings
sudo chmod +x /usr/local/bin/wings

# Verify installation
wings version
# Expected output: github.com/calagopus/wings 1.x.x (x86_64-musl)
```

### 4. Create Node in Target Calagopus Panel

1. Open Calagopus Panel admin UI (`https://panel2.saturia.codes`)
2. Navigate to **Admin → Nodes → Create New Node**
3. Fill in node details:
   - **Name**: `Azure Node` (or any descriptive name)
   - **FQDN**: Source VPS IP (e.g., `20.212.168.96`) or hostname
   - **Scheme**: `HTTP` (unless you setup SSL on Wings directly)
   - **Behind Proxy**: Enable if using Cloudflare Tunnel
   - **Memory/Disk**: Source VPS resource limits (e.g., 16384 MB RAM)
4. Save the node
5. Panel will display an **auto-deploy command** like:
   ```bash
   wings configure --join-data eyJhbG...VCJ9...
   ```
   Copy this command.

### 5. Configure Wings with Join Token

On the Source VPS:

```bash
# Create Wings config directory
sudo mkdir -p /etc/calagopus

# Run the auto-deploy command from Panel
sudo wings configure --join-data <token-from-panel>

# Verify config was created
sudo cat /etc/calagopus/config.yml
```

The config file should contain the Panel URL, node UUID, and API token.

### 6. Create systemd Service for Calagopus Wings

Create `/etc/systemd/system/wings.service`:

```ini
[Unit]
Description=Calagopus Wings Daemon
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/calagopus
ExecStart=/usr/local/bin/wings
Restart=on-failure
RestartSec=5s
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable wings
sudo systemctl start wings

# Verify Wings is running
sudo systemctl status wings --no-pager
sudo journalctl -u wings -n 30 --no-pager
```

### 7. Verify Node Connection

1. In Calagopus Panel, go to **Admin → Nodes**
2. The new node should show as **online** with a green heartbeat
3. Check Wings logs for connection confirmation:
   ```bash
   sudo journalctl -u wings -f
   ```
4. Create a test server on the new node to verify full functionality

## Troubleshooting

### Wings Binary Download Fails

**Symptom**: `curl` returns 404 or connection timeout

**Fix**: Check the GitHub releases page manually and verify the correct binary name/architecture:
```bash
curl -s https://api.github.com/repos/calagopus/wings/releases/latest | grep browser_download_url
```

### Wings Config Command Returns Error

**Symptom**: `wings configure --join-data` fails with "invalid token" or similar

**Fix**: 
- Verify the join token was copied completely (tokens are very long, ~500+ chars)
- Regenerate the token in Panel (delete the node and recreate it)
- Ensure `/etc/calagopus` directory exists and is writable by root

### Node Shows Offline in Panel

**Symptom**: Panel shows node as offline/red despite Wings running

**Fix**:
1. Check Wings logs: `sudo journalctl -u wings -n 50`
2. Verify Wings can reach Panel:
   ```bash
   curl -I https://panel2.saturia.codes
   ```
3. Check firewall rules (Wings needs outbound HTTPS to Panel)
4. If behind NAT/Azure floating IP, ensure node FQDN in Panel matches Wings' reachable address

### Port Conflicts

**Symptom**: Wings fails to start with "address already in use"

**Fix**: Calagopus Wings uses different default ports than Pelican Wings. Check `/etc/calagopus/config.yml` for configured ports and verify they're available:
```bash
sudo ss -tlnp | grep -E ':(8080|2022)'
```

## Key Differences: Pelican Wings vs Calagopus Wings

- **Binary name**: Same (`wings`), but different codebases (Pelican = Go, Calagopus = Rust)
- **Config location**: Pelican uses `/etc/pelican/config.yml`, Calagopus uses `/etc/calagopus/config.yml`
- **Join method**: Calagopus uses `--join-data` token (one-command setup), Pelican uses `--panel-url` + `--token` + `--node` (multi-arg)
- **Protocol**: Both use similar API contracts, but Calagopus may have different auth/heartbeat endpoints

## Post-Migration Cleanup (Optional)

After verifying the new Wings node works:

```bash
# Remove old Pelican systemd units
sudo rm -f /etc/systemd/system/wings.service.bak
sudo systemctl daemon-reload

# Remove old Pelican config
sudo rm -rf /etc/pelican

# Remove Nginx config (if Pelican was the only site)
sudo rm -f /etc/nginx/sites-enabled/pelican.conf
```

## Notes

- **Data preservation**: This workflow does NOT migrate existing game servers. If you need to preserve Pelican game servers, export them from Pelican Panel before uninstalling, then import into Calagopus (manual process, not documented here).
- **DNS/Tunnel**: If the old Panel used Cloudflare Tunnel, you'll need to remove or redirect the tunnel ingress after Panel removal.
- **Calagopus Wings version compatibility**: Ensure Wings version matches Panel version (check Calagopus docs for compatibility matrix).
