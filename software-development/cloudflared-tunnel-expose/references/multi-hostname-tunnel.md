# Multi-Hostname Tunnel Management

## Adding hostname to existing tunnel config

### For locally-managed tunnels (`config_src: local`)

1. **Edit config file** — Add new ingress entry ABOVE the 404 fallback:
   ```yaml
   ingress:
     - hostname: existing.saturia.codes
       service: http://localhost:4000
     - hostname: new.saturia.codes      # New entry
       service: http://localhost:8000
     - service: http_status:404          # Must be last
   ```

2. **Restart cloudflared** to load new config:
   ```bash
   sudo systemctl restart cloudflared
   ```

3. **Verify loaded config** in logs:
   ```bash
   sudo journalctl -u cloudflared -n 20 | grep -E "hostname|service"
   ```
   Loaded hostnames appear in daemon logs after restart.

4. **Add DNS record** (if not already routed):
   ```bash
   cloudflared tunnel route dns <tunnel-id> new.saturia.codes
   ```
   Or via Cloudflare dashboard: DNS → Add CNAME → `new.saturia.codes` → `<tunnel-id>.cfargotunnel.com` (Proxied: ON)

### DNS conflict resolution

**Symptom:** `cloudflared tunnel route dns` fails with:
```
Failed to add route: code: 1003, reason: An A, AAAA, or CNAME record with that host already exists
```

**Cause:** DNS record for hostname exists, pointing to different tunnel or IP.

**Resolution paths:**

A. **Remove old ingress entry from previous tunnel** (preferred when old tunnel still active):
   1. SSH to old VPS/host
   2. Edit `/etc/cloudflared/config.yml` — remove hostname entry
   3. `sudo systemctl restart cloudflared`
   4. From new host: `cloudflared tunnel route dns <new-tunnel-id> hostname`
   5. DNS CNAME auto-updates to new tunnel

B. **Manual DNS update via Cloudflare dashboard** (when old tunnel stopped or inaccessible):
   1. Cloudflare dashboard → Domain → DNS → Records
   2. Find existing CNAME for hostname
   3. Edit → Change target to `<new-tunnel-id>.cfargotunnel.com`
   4. Save (Proxied: ON)

C. **Delete and recreate DNS record via API** (automation):
   ```bash
   # Get record ID
   RECORD_ID=$(curl -sX GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=hostname.saturia.codes" \
     -H "Authorization: Bearer $TOKEN" | jq -r '.result[0].id')
   
   # Delete old record
   curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
     -H "Authorization: Bearer $TOKEN"
   
   # Create new CNAME
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"type":"CNAME","name":"hostname","content":"<tunnel-id>.cfargotunnel.com","proxied":true}'
   ```

**Pitfall:** After removing hostname from old tunnel config and restarting cloudflared, DNS record does NOT auto-delete — it remains pointing to old tunnel ID. New tunnel's `route dns` command fails until DNS record is manually updated or deleted. Always verify DNS target matches active tunnel ID: `dig hostname.saturia.codes` → CNAME should show current tunnel ID.

## Multi-VPS tunnel architecture

**Common pattern:** Multiple VPS hosts, each with own tunnel, some hostnames need migration between tunnels.

**Example topology (saturia.codes):**
- **VPS Azure** (`20.212.168.96`) — Tunnel `a9521ff9` serves:
  - `agent.saturia.codes` → port 9119 (Hermes)
  - `omniroute.saturia.codes` → port 20129
  - `wings.saturia.codes` → port 8080 (Calagopus Wings)
  
- **VPS New** (`45.137.70.30`) — Tunnel `1d934fc7` serves:
  - `api.saturia.codes` → port 4000
  - `panel.saturia.codes` → port 8000 (Calagopus Panel)
  - `panel2.saturia.codes` → port 8000 (same service, dual hostname)

**Migration pattern:** Move `panel.saturia.codes` from VPS Azure tunnel to VPS New tunnel:
1. Add hostname to new tunnel config (VPS New)
2. Restart cloudflared on new tunnel
3. Remove hostname from old tunnel config (VPS Azure) — prevents conflict
4. Restart cloudflared on old tunnel
5. Update DNS CNAME target from old tunnel ID to new tunnel ID
6. Verify: `curl -I https://panel.saturia.codes` → HTTP 200, served from new VPS

**Pitfall:** If step 3 skipped (old tunnel still serves hostname), DNS routing is ambiguous — Cloudflare routes to whichever tunnel responded first during DNS resolution. Symptom: intermittent 502 errors or requests routed to wrong backend. Always remove hostname from old tunnel config BEFORE updating DNS.
