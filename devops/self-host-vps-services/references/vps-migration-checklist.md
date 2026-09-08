# VPS-to-VPS Service Migration Checklist

Use this when moving an existing Node.js/Python service from one VPS to another while preserving the same public hostname via Cloudflare Tunnel.

## Pre-migration
1. **Verify source location**:
   ```bash
   # Check local Hermes
   ls -la /home/saturia/<service>
   
   # Check old VPS
   ssh root@<old-vps> "ls -la /home/saturia/<service>"
   ```
   Service code might be on Hermes, old VPS, or in a git remote. Do NOT assume.

2. **Identify service dependencies**:
   - Runtime: Node.js version, Python version, system packages
   - External services: Redis, MariaDB, Docker
   - Systemd unit location: `/etc/systemd/system/` (system) or `~/.config/systemd/user/` (user)

3. **Check disk space on new VPS**:
   ```bash
   ssh root@<new-vps> "df -h /"
   ```
   Ensure at least 5GB free for Node.js services (node_modules can be 1-3GB).

## Migration steps

### 1. Install runtime on new VPS
```bash
# Node.js
ssh root@<new-vps> "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt update && apt install -y nodejs git curl build-essential"

# Python (if needed)
ssh root@<new-vps> "apt install -y python3 python3-pip python3-venv"

# Verify
ssh root@<new-vps> "node --version && npm --version"
```

### 2. Copy service code to new VPS
```bash
# From Hermes to new VPS (exclude node_modules, include package.json)
rsync -az --exclude=node_modules --exclude=.git \
  -e "ssh -o StrictHostKeyChecking=no" \
  /home/saturia/<service-name>/ \
  root@<new-vps-hostname>:/root/<service-name>/

# From old VPS to new VPS (if source is on old VPS)
ssh root@<old-vps> "rsync -az --exclude=node_modules /home/saturia/<service>/ root@<new-vps>:/root/<service>/"
```

### 3. Install dependencies on new VPS
```bash
ssh root@<new-vps> "cd /root/<service-name> && npm install"

# Verify critical binaries
ssh root@<new-vps> "cd /root/<service-name> && ls -la node_modules/.bin/"
```

### 4. Copy systemd unit and adjust paths
```bash
# Copy existing unit from old VPS or Hermes
scp /etc/systemd/system/<service>.service /tmp/

# Edit paths: WorkingDirectory, ExecStart, Environment
# Then upload to new VPS
scp /tmp/<service>.service root@<new-vps>:/tmp/
ssh root@<new-vps> "mv /tmp/<service>.service /etc/systemd/system/ && systemctl daemon-reload"
```

### 5. Start service and verify locally
```bash
ssh root@<new-vps> "systemctl enable --now <service> && sleep 3 && systemctl status <service> --no-pager"

# Test local endpoint
ssh root@<new-vps> "curl -s http://localhost:<port>/health"
```

### 6. Install Cloudflare Tunnel on new VPS
```bash
# Copy credentials from old VPS (or use existing tunnel credentials)
scp root@<old-vps>:/etc/cloudflared/credentials.json /tmp/
scp root@<old-vps>:/etc/cloudflared/config.yml /tmp/

# Install cloudflared binary
ssh root@<new-vps> "curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"

# Create config directory and copy files
ssh root@<new-vps> "mkdir -p /etc/cloudflared && chmod 600 /etc/cloudflared"
scp /tmp/credentials.json root@<new-vps>:/etc/cloudflared/
scp /tmp/config.yml root@<new-vps>:/etc/cloudflared/

# Update config.yml ingress for new service port (if different)
ssh root@<new-vps> "nano /etc/cloudflared/config.yml"
# Ensure ingress has:
#   - hostname: api.saturia.codes
#     service: http://localhost:<port>
```

### 7. Create cloudflared systemd unit (locally-managed tunnel)
```bash
ssh root@<new-vps> "cat > /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]
Description=Cloudflare Tunnel (locally-managed)
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=root
ExecStartPre=/bin/sleep 2
ExecStart=/usr/local/bin/cloudflared --config /etc/cloudflared/config.yml tunnel run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
"

ssh root@<new-vps> "systemctl daemon-reload && systemctl enable --now cloudflared"

# Wait for tunnel to connect (3 edge locations)
sleep 10

# Verify tunnel registered
ssh root@<new-vps> "journalctl -u cloudflared --no-pager -n 10 | grep 'Registered tunnel connection'"
```

### 8. Update DNS record (CRITICAL)
**Delete old A record, create CNAME**. An A record will NOT route through tunnel even if it points to a CF IP.

```bash
# Get zone ID
ZONE_ID=$(curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=saturia.codes" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")

# Find existing A record ID
RECORD_ID=$(curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=api.saturia.codes" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")

# Delete A record (if exists)
if [ -n "$RECORD_ID" ]; then
  curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    -H "Authorization: Bearer $CF_TOKEN"
  echo "Deleted A record $RECORD_ID"
fi

# Create CNAME → tunnel (proxied)
TUNNEL_ID="a9521ff9-c74b-422a-a900-6fee7294aa2a"  # from /etc/cloudflared/config.yml
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"api.saturia.codes","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true}'
```

### 9. Verify DNS propagation and tunnel routing
```bash
# DNS should resolve to CF IPs (not VPS IP)
dig +short api.saturia.codes @1.1.1.1
# Expected: 104.21.x.x, 172.67.x.x (CF anycast IPs)

# Test from new VPS (should work immediately, no DNS cache)
ssh root@<new-vps> "curl -I https://api.saturia.codes"
# Expected: HTTP/2 200

# Test from local machine (may take 1-2 min for DNS to propagate)
curl -I https://api.saturia.codes
```

### 10. Decommission old VPS service
```bash
# Stop old service (only after new one is verified working)
ssh root@<old-vps> "systemctl stop <service> && systemctl disable <service>"

# Optionally stop old cloudflared (if tunnel moved entirely to new VPS)
# ssh root@<old-vps> "systemctl stop cloudflared && systemctl disable cloudflared"
```

## Common failures

### "Connection refused" from tunnel
- **Cause**: Service not listening on expected port, or tunnel ingress points to wrong port
- **Fix**: `ssh root@<new-vps> "ss -tlnp | grep <port>"` → verify service is bound to 0.0.0.0 or 127.0.0.1
- Check `/etc/cloudflared/config.yml` ingress hostname matches and service URL is `http://localhost:<correct-port>`

### "522 Connection timed out" from browser
- **Cause**: DNS is still an A record pointing to VPS IP (not CNAME to tunnel)
- **Fix**: Delete A record, create CNAME → `<tunnel-id>.cfargotunnel.com` with proxied=true
- Verify: `dig +short api.saturia.codes CNAME` → should return `<tunnel-id>.cfargotunnel.com`

### "404 Not Found" from CF tunnel
- **Cause**: Hostname not registered with tunnel (remotely-managed tunnel only)
- **Fix**: Add hostname via **CF Zero Trust dashboard** → Networks → Tunnels → select tunnel → Public Hostnames → Add
- OR: `cloudflared tunnel route dns <tunnel-id> api.saturia.codes` (requires proper API token, not just tunnel token)

### Service crashes on start with "ENOENT: no such file or directory"
- **Cause**: Missing system binary (node, python, edge-tts, chromium, etc.)
- **Fix**: Install missing dependency on new VPS, or symlink to correct path
- Example: `ln -sf /home/saturia/.hermes/node/bin/node /usr/local/bin/node`

### npm install fails with "ENOSPC: no space left on device"
- **Cause**: Root partition full, node_modules too large
- **Fix**: Clear npm cache `npm cache clean --force`, delete /tmp/* files, or move service to a larger disk mount
- Check space: `df -h /`

## Notes
- **Exclude node_modules from rsync** — always let npm install rebuild them on target to avoid binary incompatibility
- **Test locally before DNS cutover** — `ssh root@<new-vps> "curl localhost:<port>"` should work before updating DNS
- **DNS propagation takes 1-2 minutes** — test from the new VPS first (no cache) to verify tunnel routing
- **For remotely-managed tunnels** (config pushed from CF API), local `/etc/cloudflared/config.yml` edits are validated but NOT pushed. Must add hostnames via CF dashboard or API.
