# Pelican Panel Bare-Metal Install

Step-by-step recipe for installing [Pelican](https://pelican.dev/) (Laravel 13 + Filament/Livewire) on a Debian/Ubuntu VPS without Docker.

Verified 2026-08-29 on Ubuntu 24.04, PHP 8.3.33, MariaDB 10.11, Node 22.

## Pre-flight checks
- **Panel location**: `/var/www/pelican` on the root disk (61GB+ after resize). Do NOT use `/var/www/pelican` — that was a temporary/ephemeral disk (`/dev/sdc`) that gets wiped on reboot. The root disk (`/`, 61GB) is the correct location now.
- PHP 8.3 + extensions (zip, mbstring, bcmath, ctype, fileinfo, json, mysql, openssl, pdo_mysql, tokenizer, xml). Enable zip: `sudo phpenmod zip`.
- `composer` (set `COMPOSER_ALLOW_SUPERUSER=1`), `sudo mariadb` (socket auth), redis (`PONG`).
- Node at `/home/saturia/.hermes/node/bin/node` (NOT in PATH) — use absolute paths for npm.
- nginx default site on :80 must remain untouched. PHP-FPM socket at `unix:/run/php/php8.3-fpm.sock`.

## Steps

### 1. Download

⚠️ **WRONG URL**: `curl -sL https://pelican.dev/install/panel.sh` returns HTML (404 page). Pelican's docs site is Docusaurus, not an installer host.

**Correct download** (GitHub releases — `.tar.gz` of the panel source):
```bash
sudo mkdir -p /var/www/pelican
cd /var/www/pelican
curl -L https://github.com/pelican/panel/releases/latest/download/panel.tar.gz | sudo tar -xzv
```

If the GitHub URL also fails (rate limit / proxy), find the latest release manually at `https://github.com/pelican-dev/panel/releases` and substitute the version:
```bash
curl -L https://github.com/pelican-dev/panel/releases/download/v<version>/panel.tar.gz | sudo tar -xzv
```

### 2. PHP zip
```bash
sudo apt install -y php8.3-zip && sudo phpenmod zip
php -m | grep zip
```

### 3. Composer install
```bash
cd /var/www/pelican
export COMPOSER_ALLOW_SUPERUSER=1
export COMPOSER_CACHE_DIR=/var/www/pelican/.composer-cache   # keep off root disk
composer install --no-dev --no-interaction --prefer-dist
```
Fallback: add `--ignore-platform-reqs` on memory errors. Post-install runs `p:plugin:composer` + Filament publish.

### 4. Build `.env`
`.env.example` is minimal (6 lines). Construct the full file manually:
```
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:<$(openssl rand -base64 32)>
APP_URL=https://panel.saturia.codes
APP_INSTALLED=false
APP_LOCALE=en
APP_TIMEZONE=Asia/Jakarta
APP_SERVICE_AUTHOR=<anything>
APP_NAME=Pelican

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=pelican
DB_USERNAME=pelican
DB_PASSWORD=<generated>

CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=          # empty if unauthenticated (no requirepass)
REDIS_PORT=6379

LOG_CHANNEL=stack
LOG_LEVEL=warning
BROADCAST_DRIVER=log
FILESYSTEM_DISK=local
```
**Critical**: `DB_HOST=localhost` (socket, not 127.0.0.1 which forces TCP and fails for `pelican@localhost`). `REDIS_PASSWORD=` empty if unauthenticated — a placeholder breaks cache/session/queue.

### 5. Create MariaDB db + user

Existing database (from prior install) may already have a `pelican` DB and `saturia` user:
```bash
DB_PASS='3551'
sudo mysql -e "CREATE DATABASE IF NOT EXISTS pelican; CREATE USER IF NOT EXISTS 'saturia'@'localhost' IDENTIFIED BY '${DB_PASS}'; GRANT ALL PRIVILEGES ON pelican.* TO 'saturia'@'localhost'; FLUSH PRIVILEGES;"
```

> Note: The panel's existing DB user is `saturia` (not `pelican`). Use `saturia` as the DB_USERNAME in `.env`.

### 6. Storage permissions (FULL SWEEP)
```bash
# Do this ONCE after install — covers .env, plugins, storage, bootstrap/cache, public
sudo chown -R www-data:www-data /var/www/pelican/.env /var/www/pelican/plugins /var/www/pelican/storage /var/www/pelican/bootstrap/cache /var/www/pelican/public
```
**Why**: `public/` is needed because plugins (e.g. `discord-webhooks`) publish CSS to `public/plugins/<name>/css/` at runtime. `.env` must be writable for web settings saves. `storage/` and `bootstrap/cache/` for Laravel. `plugins/` for plugin installation.

### 7. Migrate
```bash
cd /var/www/pelican
sudo -u www-data php artisan migrate --force
```
If "Nothing to migrate", tables may already exist — verify with `SHOW TABLES`.

### 8. Seed / environment setup
```bash
sudo -u www-data php artisan db:seed --force
sudo -u www-data php artisan p:environment:setup --url=https://panel.saturia.codes
```
`database/seeders/` does not exist in Pelican — seeders are empty. Use `p:environment:setup` for settings.

### 9. Create admin user
```bash
cd /var/www/pelican
sudo -u www-data php artisan p:user:make \
  --email=admin@saturia.codes \
  --username=admin \
  --admin=1 \
  --password='<generated>' \
  --no-interaction
```
If user already exists (duplicate email), reset password via tinker:
```bash
sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
\$u = \App\Models\User::where('username','admin')->first();
\$u->password = Hash::make('<new-password>');
\$u->save();
"
```
`HOME=/var/tmp` required — psy writes to `/var/www/.config/psysh` and fails otherwise.

**Verify login** (Filament uses Livewire, not form POST):
```bash
sudo -u www-data HOME=/var/tmp php artisan tinker --execute="
\$u = \App\Models\User::where('username','admin')->first();
echo Hash::check('<password>', \$u->password) ? 'LOGIN OK' : 'FAIL';
"
```

### 10. npm build
```bash
cd /var/www/pelican
NODE_OPTIONS=--openssl-legacy-provider /home/saturia/.hermes/node/bin/npm install --legacy-peer-deps
NODE_OPTIONS=--openssl-legacy-provider /home/saturia/.hermes/node/bin/npm run build
```
Check `package.json` — script may be `build` or `build:production`. Use whichever exists.

### 11. Systemd queue worker
`/etc/systemd/system/pelican.service`:
```ini
[Unit]
Description=Pelican Panel Queue Worker
After=network.target mariadb.service redis.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/pelican
ExecStart=/usr/bin/php /var/www/pelican/artisan queue:work --sleep=3 --tries=3
Restart=on-failure
RestartSec=5
KillMode=process
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now pelican.service
systemctl is-active pelican.service   # should be active
```
Mandatory — processes `AccountCreated` notifications and other queued jobs.

### 12. Storage symlink
```bash
cd /var/www/pelican
php artisan storage:link
```
If this fails with "Permission denied" when run as `www-data`, the `public/` directory is owned by a different user.
Run as the owner of `public/` (typically `saturia`), not `www-data`. After the full ownership sweep in Step 6, `public/` is owned by www-data and this should work as www-data.

### 13. nginx vhost
`/etc/nginx/sites-available/pelican`:
```nginx
server {
    listen 127.0.0.1:8088;
    listen [::1]:8088;
    server_name panel.saturia.codes;

    root /var/www/pelican/public;
    index index.php;
    client_max_body_size 100M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_read_timeout 120;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/pelican /etc/nginx/sites-enabled/pelican
sudo nginx -t && sudo systemctl reload nginx
```

### 14. Verify
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8088/   # expect 302 (→ /login)
curl -s http://127.0.0.1:8088/login | grep -i "pelican\|filament"  # expect HTML
```
**A 302 redirect to `/login` is the correct success signal.** A `POST /login` returns 405 because Filament uses Livewire `wire:submit` AJAX, not a regular form POST. Verify credentials via tinker `Hash::check()`, not curl.

## Pitfalls
- **405 on POST /login** — expected. Filament login is Livewire AJAX, not form POST. Don't chase this.
- **`key:generate` fails when APP_KEY empty** — pre-generate with `base64:$(openssl rand -base64 32)`.
- **`DB_HOST=127.0.0.1` breaks** — forces TCP; `pelican@localhost` only has socket auth. Use `localhost`.
- **`fastcgi_pass 127.0.0.1:9000` returns 502** — FPM listens on socket only. Use `unix:/run/php/php8.3-fpm.sock`.
- **psy write error in tinker** — `sudo -u www-data HOME=/var/tmp php artisan tinker ...`
- **Empty `.env.example`** — Pelican's is only 6 lines. Construct full env manually.
- **No DatabaseSeeder** — `database/seeders/` doesn't exist. Settings come from `p:environment:setup`.
- **composer cache on small root disk** — set `COMPOSER_CACHE_DIR` to data disk.
- **`APP_INSTALLED=false`** — Pelican may show install wizard if not set.
- **`users` table has no `root_admin` column** in current Pelican. Don't assume Pterodactyl schema.
- **Plugin CSS mkdir error** — `public/` must be owned by www-data. Do the full ownership sweep in Step 6.
- **`.env` save error** — `.env` must be owned by www-data. Do the full ownership sweep in Step 6.
- **`storage:link` fails as www-data** — `public/` not owned by www-data. Fix: `sudo chown www-data:www-data /var/www/pelican/public`.
