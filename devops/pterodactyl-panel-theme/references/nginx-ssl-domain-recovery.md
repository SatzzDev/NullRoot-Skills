# Nginx SSL Domain Recovery

## ⚠️ CRITICAL: Verify before changing production config
**NEVER assume why a panel is down.** Before touching nginx config or SSL:
1. Check if panel was ALREADY working on a different domain
2. Verify DNS setup (proxied vs DNS-only) via `dig` or Cloudflare dashboard
3. Test current nginx config with `curl -I http://localhost -H "Host: domain"`
4. If users report "panel down" but logs show recent successful requests to OLD domain, the issue is likely client-side (DNS not propagated, browser cache) — NOT server config

**This session's mistake (2026-08-26):** User said `panel.satzz.online` returned 404. Agent assumed Cloudflare proxy + SSL issue and changed domain in nginx config from working `panel.saturia.codes` → broken `panel.satzz.online`. Reality: DNS was **DNS-only** (not proxied), users were still accessing via old domain successfully, and the "404" was simply because new domain wasn't set up yet. Agent broke production by "fixing" a non-problem. **Always confirm current state before changing config.**

## Symptom
Panel returns 404 from both origin and Cloudflare. Users were accessing old domain successfully before.

## Root causes (all three occurred together 2026-08-26)
1. **Nginx config not symlinked** — `/etc/nginx/sites-available/pterodactyl.conf` exists but `/etc/nginx/sites-enabled/pterodactyl.conf` symlink missing → nginx serves default 404
2. **Wrong domain in config** — config still pointed to old domain `panel.saturia.codes` but DNS/Cloudflare now route `panel.satzz.online` → no matching server_name
3. **SSL certificate missing for new domain** — certbot certs under `/etc/letsencrypt/live/panel.saturia.codes/` but config (after domain update) references `panel.satzz.online` → nginx test fails with `BIO_new_file() failed`

## Recovery procedure
1. **Re-enable config symlink:**
   ```bash
   sudo ln -sf /etc/nginx/sites-available/pterodactyl.conf /etc/nginx/sites-enabled/pterodactyl.conf
   ```

2. **Update domain in config** (if domain changed):
   ```bash
   sudo sed -i 's/old.domain/new.domain/g' /etc/nginx/sites-available/pterodactyl.conf
   ```

3. **Temporarily set HTTP-only config** (so certbot can verify):
   Create temp config with only `listen 80` block, no SSL directives. Must include:
   - `server_name new.domain;`
   - `root /var/www/pterodactyl/public;`
   - `location /` + `location ~ \.php$` blocks (Laravel needs PHP for acme-challenge redirect)
   
   ```bash
   sudo cp /tmp/pterodactyl-http-only.conf /etc/nginx/sites-available/pterodactyl.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **Get SSL certificate:**
   ```bash
   sudo certbot --nginx -d new.domain --non-interactive --agree-tos --email your@email.com
   ```
   Certbot will auto-update the config to add SSL blocks + redirect.

5. **Verify local origin:**
   ```bash
   curl -I http://localhost -H "Host: new.domain"  # should be 200 or 301→https
   curl -I https://new.domain  # check for 200 or Cloudflare errors
   ```

## Cloudflare redirect loop after SSL setup
**Symptom:** `curl https://panel.satzz.online` returns `HTTP/2 301` with `location: https://panel.satzz.online/` (redirects to itself).

**Root cause:** Cloudflare SSL/TLS mode set to "Flexible" (CF→origin over HTTP) but origin now has SSL cert and forces HTTPS redirect → loop.

**Fix:** Set Cloudflare SSL/TLS mode to **"Full (strict)"** in dashboard:
1. Cloudflare dashboard → SSL/TLS → Overview
2. Choose "Full (strict)" (validates origin cert)
3. Wait 1-2 min for cache purge

**Alternative diagnostic:** If you don't have CF dashboard access, test direct-to-origin to confirm origin itself works:
```bash
curl -I http://localhost -H "Host: panel.satzz.online"  # should redirect to https
curl -I https://localhost -H "Host: panel.satzz.online" --insecure  # should be 200
```
If origin serves correctly but CF still loops, it's definitely CF SSL mode.

## User preference
When panel is inaccessible and user wants to work on UX: **skip admin area** ("bagian admin biarin aja") — focus only on user-facing dashboard/server management UX, not admin settings/nests/nodes.
