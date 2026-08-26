# Panel opens on LAN but NOT from the internet — DNS stale / dynamic public IP

Symptom: user can't open `https://panel.<domain>` from a browser, but the server is fine.
On a home/WSL host this is almost always DNS, NOT nginx/wings/panel.

## Diagnostic ladder (rule a layer out at each step)
```bash
# 1. Server itself alive? (host-local resolve)
sudo systemctl is-active nginx wings pteroq
sudo ss -tlnp | grep -E ':80|:443|:8080'
curl -sS -m 15 -o /dev/null -w "HTTP %{http_code}\n" https://panel.<domain>/   # expect 200 on LAN

# 2. Public DNS vs real public IP
dig +short panel.<domain> @1.1.1.1          # stale? e.g. 125.162.56.176
curl -sS -m 10 https://api.ipify.org        # real now?  e.g. 125.165.107.137
# If they differ -> DNS A-record is stale. That's the bug.

# 3. Cloudflare proxied (orange) or DNS-only (grey)?
#    dig returns HOME IP (not 104.x/172.x) -> grey-cloud -> direct connection.
#    Grey-cloud + dynamic IP = record goes stale every ISP IP rotation.

# 4. Does public IP accept 443 from outside? (ISP port-block check)
curl -sS -m 15 "https://check-host.net/check-tcp?host=panel.<domain>:443&max_nodes=3"
# Also raw IP: host=<public-ip>:443  -- timeouts mean inbound 443 blocked.
```

## Root cause pattern
Home/WSL host behind a dynamic public IP; Cloudflare A-record is DNS-only (grey-cloud)
and points at the OLD IP. No DDNS updater on the box (`which cloudflared ddclient` -> none;
no CF token in /etc, /root, or .env). User only sees "can't open site" because DNS lies
about where the box is.

## Fix options
1. **Permanent + recommended: Cloudflare DDNS auto-update.** Use `scripts/cf-ddns.sh`:
   fill CF_TOKEN (scoped to "Edit zone DNS", Zone=the domain), CF_ZONE_ID, SUBDOMAINS
   (panel, node); install to /usr/local/bin/; cron `* * * * * /usr/local/bin/cf-ddns.sh`.
   Needs a CF API token from the user.
2. **Manual stopgap:** in Cloudflare, set A-record panel and node to current api.ipify.org IP.
   Works until ISP rotates the IP again — not durable.
3. **If inbound 443 is ISP-blocked:** switch record to proxied (orange) in Cloudflare and run
   nginx on a non-standard origin port (e.g. 8443) with `allow 173.245.48.0/20` only.
   Cloudflare terminates 443 and reaches you on 8443.

## Pitfall — local curl 200 is misleading
From the host, `curl panel.<domain>` may return 200 even when the site is down for everyone
else: the local resolver (Tailscale here) maps the FQDN to a LAN IP. Always cross-check with
`dig @1.1.1.1` + `api.ipify.org` before declaring the server healthy.
