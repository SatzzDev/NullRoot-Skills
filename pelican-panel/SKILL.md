---
name: pelican-panel
description: Use when administering a Pelican panel (pelican.dev).
---

# Pelican Panel Administration

Pelican panel is a PHP/Laravel-based game server panel. This skill covers common administrative tasks, permission management, and troubleshooting.

## Permission Model

Pelican runs PHP-FPM as `www-data`. The panel source lives at `/var/www/pelican/` and must be writable by both the admin user (for SSH edits/composer) and `www-data` (for web-based plugin install, file manager writes, `.env` saves).

**Recommended ownership pattern:**
```bash
sudo chown -R <admin>:www-data /var/www/pelican
sudo chmod -R g+rwX /var/www/pelican
sudo find /var/www/pelican -type d -exec chmod g+s {} +
```

This makes `www-data` the group, with setgid bit so new files inherit the group.

**Why it matters:**
- `.env` save via web Settings page → `file_put_contents` fails without group write
- Plugin install (composer/yarn) → fails if `node_modules` not owned by www-data
- File manager writes to server files → need group write on container paths

## Plugin Installation

### Important: Plugin Model is Sushi-Based

The `Plugin` model uses the [Sushi](https://github.com/calebporzio/sushi) package — it's filesystem-backed, not a database table. There is **no `plugins` table** in MySQL.

```bash
# This will FAIL — table doesn't exist
mysql -u saturia -p3551 pelican -e "SELECT * FROM plugins;"

# Plugins are auto-discovered from plugins/<id>/plugin.json on every request
php artisan p:plugin:list
```

If `Plugin::find()` returns stale data after a manual plugin upload, call `Plugin::refreshRows()` to clear Sushi's static cache:
```php
\App\Models\Plugin::refreshRows();
```

### Install via Artisan (Recommended)

```bash
# Ensure node_modules is owned by www-data
sudo chown -R www-data:www-data /var/www/pelican/node_modules
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn

cd /var/www/pelican
sudo -u www-data php artisan p:plugin:install <plugin-name>
```

### Install via Web Admin

1. Go to Pelican admin → Plugins
2. Search for the plugin
3. Click Install
4. If it fails, check `/var/www/pelican/storage/logs/laravel.log`

### Verify Installation

```bash
php artisan p:plugin:list
```

### Troubleshooting

**Install job queued but never completes?**

The Pelican queue worker runs as a systemd unit (`pelican.service`). After a disk migration or path change, the unit may still point to the old artisan path:

```bash
# Check the unit file
cat /etc/systemd/system/pelican.service | grep ExecStart

# If it points to a wiped path (e.g. /srv/pelican/artisan), fix it:
sudo sed -i 's|/old/path/artisan|/var/www/pelican/artisan|' /etc/systemd/system/pelican.service
sudo systemctl daemon-reload
sudo systemctl restart pelican.service
```

```bash
# Check restart count — high count = failing unit
systemctl status pelican.service

# Check queue worker logs
journalctl -u pelican.service --no-pager -n 30
```

**Permission errors during install**

```bash
# Fix node_modules ownership
sudo chown -R www-data:www-data /var/www/pelican/node_modules

# Fix yarn cache
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn
```

## Nginx Configuration for File Manager

The default Pelican nginx config includes:
```nginx
location ~ /\.(?!well-known).* {
    deny all;
}
```

This blocks access to dotfiles (`.env`, `.config`, `.npm`) in the file manager. **Remove this rule** if you need to edit game server config files via the web file manager. Panel authentication is handled by PHP, so this nginx rule is redundant for security.

```nginx
# Remove or comment out:
# location ~ /\.(?!well-known).* {
#     deny all;
# }
```

Then reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Reverse Proxy / Cloudflare Tunnel (SSL Termination)

When Pelican is behind a Cloudflare Tunnel or reverse proxy that terminates SSL, Laravel receives HTTP requests even though the browser uses HTTPS. This breaks Livewire file uploads with a 401 error.

### The Error

```
HttpException 401
Livewire\Features\SupportFileUploads\FileUploadController::handle()
abort_unless(request()->hasValidSignature(), 401)
```

### Root Cause

- `APP_URL=https://panel.saturia.codes` → `URL::forceHttps(true)` in `AppServiceProvider`
- Signed upload URLs are generated for `https://` scheme
- Proxy forwards HTTP to the VPS
- `hasValidSignature()` sees scheme mismatch → rejects with 401

### The Fix

In `bootstrap/app.php`, add `TrustProxies` to the web middleware stack and trust all proxies:

```php
use Illuminate\Http\Middleware\TrustProxies;

// ...

->withMiddleware(function (Middleware $middleware) {
    // ...

    $middleware->trustProxies(at: '*');

    $middleware->web([
        TrustProxies::class,
        LanguageMiddleware::class,
        SetSecurityHeaders::class,
    ]);
    
    // ...
})
```

Then clear caches:
```bash
cd /var/www/pelican
sudo -u www-data php artisan config:clear
sudo -u www-data php artisan cache:clear
sudo -u www-data php artisan view:clear
```

### Why This Matters

- Plugin uploads in admin panel use Livewire's file upload system
- Any POST request with signed URL verification fails behind a proxy
- `trustProxies(at: '*')` is safe for Cloudflare Tunnel because the tunnel is the only inbound path

### Detailed Debugging Path

See [Proxy Signed URL Debugging](references/proxy-signed-urls.md) for the full trace from error payload to root cause.

## Queue Worker

Pelican's queue worker runs as a systemd unit (`pelican.service`). It processes plugin install/uninstall jobs, notifications, and other queued tasks.

### Check Status
```bash
systemctl status pelican.service
journalctl -u pelican.service --no-pager -n 30
```

### Path Issues After Migration

If the panel was migrated to a new disk/path, the unit may still point to the old artisan path:

```bash
# Check current ExecStart
grep ExecStart /etc/systemd/system/pelican.service

# Fix if pointing to old path
sudo sed -i 's|/old/path/artisan|/var/www/pelican/artisan|' /etc/systemd/system/pelican.service
sudo systemctl daemon-reload
sudo systemctl restart pelican.service
```

A high restart count (>1000) indicates the unit is failing repeatedly — usually a missing artisan file at the configured path.

### Queue Jobs in DB

```bash
# Check pending jobs
mysql -u saturia -p3551 pelican -e "SELECT id, queue, attempts, available_at FROM jobs;"

# Check failed jobs
mysql -u saturia -p3551 pelican -e "SELECT id, exception FROM failed_jobs;"
```

### Manual Job Processing (worker not running)

`php artisan queue:restart` only broadcasts a signal — it does **not** spawn a worker. If no worker is running, queued jobs sit in the `jobs` table forever and `queue:restart` appears to do nothing. Verify a worker actually exists before assuming the unit is healthy:

```bash
ps aux | grep queue:work | grep -v grep   # empty = no worker running
```

To drain pending jobs without a full daemon, run one job at a time in the foreground:

```bash
sudo -u www-data php /var/www/pelican/artisan queue:work --once --tries=3
```

This blocks until a job finishes (prints `RUNNING` → `DONE` or failure), so you can watch a specific job's outcome live. Repeat until `jobs` is empty.

### Tinker as www-data

`sudo -u www-data php artisan tinker` fails with `Writing to directory /var/www/.config/psysh is not allowed` because `/var/www` is not writable. Fix by pointing HOME at a writable dir:

```bash
sudo -u www-data env HOME=/tmp php /var/www/pelican/artisan tinker --execute="..."
```

## Webhook Debugging (Discord type)

Discord-type webhook failures follow a distinct chain — see [Webhook Debugging](references/webhook-debugging.md) for the full trace: NULL `payload` template → `json_decode` returns null → Discord 400 + `Column 'payload' cannot be null` SQL error. Key checks: query `webhooks.successful_at` (NULL = Discord rejected the POST) and confirm the config's `payload` template has `content` or `embeds`.

For rich messages, the reference also covers **Components V2**: webhook URL needs `?with_components=true` appended, with `type: 17` containers holding `type: 10` content blocks (see the "Discord Components V2" section).

## UI Icons & Customization

**Pelican Filament uses Tabler icons, NOT Lucide.** Icons are referenced through the `App\Enums\TablerIcon` enum (values are `tabler-*` classes, e.g. `tabler-player-stop-filled`). Do not reach for Lucide or Heroicons — there is no Lucide enum in this codebase.

### Changing a Filament action icon

Power actions in the **server console** (start / restart / stop / kill) are defined as `Action` objects in `app/Filament/Server/Pages/Console.php`, each with a `->icon(TablerIcon::CaseName)` call. To swap an icon:

1. Find the action in `Console.php` (search for `->icon(TablerIcon::`).
2. Pick the replacement case from `app/Enums/TablerIcon.php` (grep the enum for the icon you want, e.g. `grep -n "PlayerStop\|Square\|CircleStop" app/Enums/TablerIcon.php`).
3. Replace the enum case. No migration or rebuild needed — Filament resolves the icon class at render time.

See [Icons & Customization](references/icons-customization.md) for the exact console action block and enum grep patterns.

## References

- [Permission Fix Pattern](references/permission-fix.md) — detailed chgrp/chmod commands and troubleshooting
- [Plugin Install Guide](references/plugin-install.md) — step-by-step plugin installation with common errors
- [Nginx Dotfile Fix](references/nginx-dotfiles.md) — removing the 403 rule for file manager access
- [Disk Migration Checklist](references/disk-migration.md) — what to update when the panel moves to a new disk/path
- [Icons & Customization](references/icons-customization.md) — where server-console power-action icons live and how to swap them using the TablerIcon enum
- [Webhook Debugging](references/webhook-debugging.md) — Discord webhook failure chain, fixes, and verification
