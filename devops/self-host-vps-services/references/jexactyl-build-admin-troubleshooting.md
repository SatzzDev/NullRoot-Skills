# Jexactyl — build, admin & troubleshooting (SUPPLEMENT to jexactyl-deploy.md)

This file captures refinements learned after the initial deploy. Read it alongside
`references/jexactyl-deploy.md`.

## 1. Frontend build — ALWAYS `yarn build:production` (NOT `npm run build`)
`package.json` `build` script = `NODE_ENV=development` (UNMINIFIED, ~49MB assets → slow
first loads). `build:production` = `clean + NODE_ENV=production webpack --mode production`
(minified, ~3MB). Use production for any live panel.

```bash
cd /var/www/jexactyl
# yarn is NOT installed by default. Node 22 ships corepack; the yarn shim lands in
# /home/saturia/.local/bin/yarn (on saturia's PATH, NOT sudo's secure_path).
# For `sudo yarn` to resolve, symlink both into /usr/local/bin:
sudo ln -sf /home/saturia/.local/bin/yarn /usr/local/bin/yarn
sudo ln -sf /home/saturia/.local/bin/yarnpkg /usr/local/bin/yarnpkg
# (corepack enable errored here; `corepack prepare yarn@1.22.22 --activate` worked.)
# Build:
sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production
#   OpenSSL 3 breaks old webpack (ERR_OSSL_EVP_UNSUPPORTED) without the legacy flag.
#   `yarn watch` = fast dev iteration; only `build:production` for pushing to live.
```

## 2. Storage perms → HTTP 500 after a sudo build
A `sudo yarn build:production` (or any sudo artisan/cache command) can leave
`storage/framework/views` owned by root/saturia instead of `www-data`. php-fpm (www-data)
then can't write compiled blade views →
`file_put_contents(.../storage/framework/views/....php): Failed to open stream: Permission denied` → 500.
Fix (run after EVERY sudo build / cache clear):
```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage -type d -exec chmod 755 {} \;
sudo find storage -type f -exec chmod 644 {} \;
sudo php artisan view:clear
```
Then `curl -s -o /dev/null -w "%{http_code}\n" https://panel.satzz.online/` → 200.

## 3. nginx — enable gzip + long asset cache (commented out by default)
The stock nginx.conf has gzip lines commented. For a 3MB JS bundle over the tunnel this matters.
Inside `server {` in the jexactyl vhost:
```nginx
gzip on; gzip_vary on; gzip_proxied any; gzip_comp_level 6; gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
```
Verify: `curl -sI <asset-url> | grep -i content-encoding` → `gzip`; cache-control `immutable`.

## 4. Create the admin user (NOT created by `migrate --seed`)
```bash
sudo php artisan p:user:make --email=admin@satzz.online --username=admin \
  --name-first=Admin --name-last=Satzz --password='<strong-pw>' --admin=1
# flags: --email --username --name-first --name-last --password --admin(=1)
# verify: sudo php artisan tinker --execute="DB::table('users')->where('username','admin')->first();"
```

## 5. mix-manifest.json
Absent by default — NORMAL for jexactyl. The SPA loads the hashed bundle directly
(e.g. `/assets/bundle.<hash>.js` referenced from the blade template). Don't treat its
absence as a failure.

## 6. Troubleshooting matrix (panel HTTP errors)
- **522 Connection timed out** — CF edge can't reach origin. Cause = DNS CNAME points to the
  VPS IP (A-record) instead of the tunnel (Azure NSG blocks inbound 80/443), OR tunnel not
  serving this hostname. Fix: CNAME → `<tunnel-id>.cfargotunnel.com` proxied; confirm
  `cloudflared` active and the ingress has the host.
- **502 Bad gateway** — nginx↔php mismatch (`fastcgi_pass 127.0.0.1:9000` TCP instead of
  `unix:/run/php/php8.3-fpm.sock` socket) OR tunnel not running. Fix socket + `systemctl reload nginx`.
- **500 Server error** — PHP fatal. Most common = storage/framework/views permission denied
  (see §2) → reset www-data ownership. Read `storage/logs/laravel.log` +
  `/var/log/nginx/jexactyl.error.log` for the real exception.
- **Slow first load** — unminified bundle (ran `npm run build`/dev instead of
  `yarn build:production`) → rebuild production; also confirm gzip + asset cache headers (§3).
