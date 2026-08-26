# Cloudflare Tunnel Public Hostname Registration

## The Problem
Adding a DNS CNAME record manually in Cloudflare DNS (e.g. `omniroute.saturia.codes` → 
`a9521ff9-c74b-422a-a900-6fee7294aa2a.cfargotunnel.com`) causes the domain to resolve to 
Cloudflare IPs, but requests return **HTTP 404** even when:
- The local `/etc/cloudflared/config.yml` has the correct ingress rule
- `cloudflared tunnel ingress validate` passes
- `cloudflared tunnel ingress rule https://omniroute.saturia.codes` matches the right service
- The service is running and responding on localhost

The tunnel logs show no requests arriving for that hostname.

## Root Cause
Cloudflare Tunnel requires **two-part registration**:
1. DNS CNAME pointing to the tunnel FQDN (visible to clients)
2. **Public hostname registration** in the tunnel's control plane (tells Cloudflare edge to route 
   traffic for that hostname to this specific tunnel)

A manual CNAME satisfies (1) but not (2). Cloudflare edge receives the request but has no 
mapping from `omniroute.saturia.codes` to tunnel `a9521ff9-...` → returns 404.

Local `config.yml` ingress rules are **origin-side only** — they tell cloudflared what to do 
with traffic it receives, but they don't register the hostname with Cloudflare's edge.

## The Fix
Delete the manual DNS record, then add the hostname via **Cloudflare Zero Trust dashboard**:

1. https://one.dash.cloudflare.com/
2. Networks → Tunnels → click your tunnel name (e.g. "satzz-online")
3. Tab: **Public Hostnames**
4. Click **Add a public hostname**
5. Fill in:
   - **Subdomain:** omniroute
   - **Domain:** saturia.codes
   - **Service Type:** HTTP
   - **URL:** localhost:20129
6. Save

This creates BOTH:
- The DNS CNAME record (same as before)
- The control-plane registration that routes edge traffic to your tunnel

Within 10-30 seconds, `curl -I https://omniroute.saturia.codes` will return the expected response 
instead of 404.

## Why Manual CNAME Fails
The DNS record type shown in the dashboard as "Tunnel" (seen in the session screenshot) is a 
**special Cloudflare-managed CNAME** created by the Zero Trust API when you add a public hostname. 
It looks like a regular CNAME but carries metadata that links it to the tunnel control plane.

A hand-created CNAME with the same target has the DNS shape but not the backend registration.

## Verification
After adding via Zero Trust:
```bash
# DNS should resolve to CF edge IPs
dig +short omniroute.saturia.codes
# 172.67.178.53
# 104.21.17.194

# Tunnel should route traffic (not 404)
curl -I https://omniroute.saturia.codes
# HTTP/2 200  (or 307, 301, etc. — anything but 404)
```

Tunnel logs (`sudo journalctl -u cloudflared -f`) should show requests arriving:
```
INF Request received connIndex=2 dest=https://omniroute.saturia.codes/ ...
```

If you still see 404 and no logs, the hostname is not registered. Check the Zero Trust dashboard 
→ Tunnels → [your tunnel] → Public Hostnames tab to confirm it's listed.

## When to Use CLI vs Dashboard
- **Dashboard (recommended):** easiest path, creates both DNS + registration atomically
- **CLI with API token:** `cloudflared tunnel route dns <tunnel-name> <hostname>` works but 
  requires a Cloudflare API token (not the tunnel run token). The VPS has only a run token 
  (`CLOUDFLARE_TUNNEL_TOKEN=cfut_...`), so CLI registration is not available there.
