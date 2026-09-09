# Calagopus Wings Behind Cloudflare Tunnel

When connecting a Calagopus Wings node to a panel via Cloudflare Tunnel, the node must be accessible over HTTPS from both the panel backend (server-to-server) and the user's browser (frontend verification).

## Key Configuration Points

### 1. Wings Listens on HTTP Port 8080

Calagopus Wings runs an HTTP API on port 8080 by default. The panel communicates with this API to manage servers, retrieve status, and stream logs.

### 2. Cloudflare Tunnel Ingress

Add Wings to the tunnel's ingress rules in `/etc/cloudflared/config.yml`:

```yaml
ingress:
  - hostname: wings.saturia.codes
    service: http://localhost:8080
  - service: http_status:404
```

Restart the tunnel after editing: `sudo systemctl restart cloudflared`.

### 3. DNS Registration

**For remotely-managed tunnels** (config pushed from Cloudflare API), adding the hostname to the local `config.yml` is NOT sufficient. The hostname must be registered via:

- **Method A (Dashboard)**: Cloudflare Zero Trust → Networks → Tunnels → select tunnel → Public Hostnames → Add
  - Subdomain: `wings`
  - Domain: `saturia.codes`
  - Service: `HTTP`, `localhost:8080`

- **Method B (CLI with Origin CA cert)**: `cloudflared tunnel route dns <tunnel-id> wings.saturia.codes`
  - Requires `~/.cloudflared/cert.pem` from `cloudflared tunnel login` (browser OAuth flow)
  - The tunnel run-token alone cannot register DNS

Without registration, the hostname resolves but returns HTTP 404 from the tunnel.

### 4. Panel Node Configuration

In the Calagopus panel when creating/editing the node:

- **URL**: `http://20.212.168.96:8080` (for backend-to-wings, direct IP if same VPS)
- **Public URL**: `https://wings.saturia.codes` (for browser-to-wings, via tunnel)

The **URL** field is for server-to-server communication (panel backend → Wings API). Use the direct IP/localhost if Wings is on the same VPS as the panel, or the public tunnel URL if Wings is on a different VPS.

The **Public URL** field is for browser-to-wings communication (file manager uploads, console WebSocket). This MUST be the HTTPS tunnel URL.

### 5. Verification

**Backend connectivity** (panel to Wings):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
# Expected: 401 (Wings auth challenge) or 200 (reachable)
```

**Frontend connectivity** (browser to Wings via tunnel):
```bash
curl -s -o /dev/null -w "%{http_code}" https://wings.saturia.codes/
# Expected: 401 or 200 (NOT 404, 502, or timeout)
```

In the panel UI, the node's connection status should show:
- **Backend to Wings**: ✅ Connection established
- **Frontend to Wings**: ✅ (or ❌ with "Network Error" if tunnel routing failed)

### 6. Common Issues

**Frontend shows "Network Error" but backend succeeds**:
- Hostname not registered with tunnel (only local config.yml edited) → add via dashboard or `cloudflared tunnel route dns`
- DNS CNAME doesn't exist or points to wrong target → verify `dig wings.saturia.codes` returns CF IPs
- Browser mixed-content blocking (panel on HTTPS, Wings URL set to HTTP) → use HTTPS public URL

**Both backend and frontend fail**:
- Wings service not running → `systemctl status wings`
- Wings port 8080 not listening → `ss -tlnp | grep 8080`
- Tunnel ingress missing or wrong port → check `/etc/cloudflared/config.yml` and `journalctl -u cloudflared`

**Backend fails but frontend succeeds**:
- Panel node URL points to wrong IP/port → update node URL to match Wings actual address
- Firewall blocking localhost → unlikely, but check `iptables -L` if on a hardened VPS

## Workflow for Adding a New Wings Node

1. **Install Wings** on the target VPS (follow Calagopus Wings docs)
2. **Create node in panel** (Admin → Nodes → Create)
   - Name: descriptive name (e.g., "Azure VPS")
   - Location: choose or create location
   - URL: `http://<wings-vps-ip>:8080` (backend connection)
   - Public URL: `https://wings.<domain>` (frontend connection)
3. **Copy join-data token** from node creation success page
4. **Configure Wings** on target VPS:
   ```bash
   calagopus-wings configure --join-data <base64-token>
   ```
   This writes `/etc/calagopus-wings/config.yml` with panel URL, node UUID, and auth token.
5. **Install Wings as systemd service**:
   ```bash
   sudo tee /etc/systemd/system/wings.service > /dev/null <<'EOF'
   [Unit]
   Description=Calagopus Wings Daemon
   After=network.target docker.service
   Requires=docker.service

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/etc/calagopus-wings
   ExecStart=/usr/local/bin/calagopus-wings
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl daemon-reload
   sudo systemctl enable --now wings
   ```
6. **Add tunnel ingress** (if Wings is on a different VPS or needs public access):
   - Edit `/etc/cloudflared/config.yml`, add hostname → `http://localhost:8080`
   - `sudo systemctl restart cloudflared`
7. **Register hostname** via CF dashboard (Public Hostnames → Add)
8. **Verify** in panel: node shows green heart, both backend and frontend checks pass

## Multi-VPS Setup

When the panel is on VPS A and Wings is on VPS B:

- **Panel backend → Wings**: Use Wings' public tunnel URL in node **URL** field (e.g., `https://wings-vps-b.saturia.codes`)
- **Browser → Wings**: Use same public tunnel URL in node **Public URL** field
- **Wings VPS B**: Must have its own Cloudflare Tunnel running, with `wings-vps-b.saturia.codes` ingress → `http://localhost:8080`

Both VPSes can share the same tunnel credentials (same tunnel ID, different hostnames in ingress), or each can have its own tunnel. The shared-tunnel approach is simpler (fewer tunnel daemons to manage).

## Security Notes

- Wings API is NOT public-facing by default — it requires an auth token (`Authorization: Bearer <token>`) passed from the panel
- The tunnel exposes Wings' HTTP port, but requests without valid auth tokens are rejected with 401
- Do NOT disable Wings authentication or expose it without a tunnel on a public IP
- The join-data token contains the panel URL, node UUID, and initial auth token — treat it as a secret
