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

# If it points to a wiped path (e.g. /srv/pelican/artisan), fix it:
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

### Deploy rule (critical)
After editing **any** job class, controller, or middleware in `app/Jobs`, `app/Http/Controllers`, or `app/Listeners`, the queue worker caches the old compiled class in memory. `php artisan queue:restart` only broadcasts a signal — it does **not** reload the PHP source if opcache is off (Pelican runs with opcache disabled in dev-style setups). **Always restart the systemd unit after code edits:**
```bash
sudo systemctl restart pelican.service
```
Without this, new code simply does not run — the old class definition keeps serving. This is NOT theoretical; it manifested as a failed test where `accent_color` stayed as the literal string `"color"` for 3+ test cycles despite the patch being installed. Verify by checking `webhooks.successful_at` is populated after dispatching a test event.

## Webhook Debugging (Discord type)

Discord-type webhook failures follow a distinct chain — see [Webhook Debugging](references/webhook-debugging.md) for the full trace: NULL `payload` template → `json_decode` returns null → Discord 400 + `Column 'payload' cannot be null` SQL error. Key checks: query `webhooks.successful_at` (NULL = Discord rejected the POST) and confirm the config's `payload` template has `content` or `embeds`.

For rich messages, the reference also covers **Components V2**: webhook URL needs `?with_components=true` appended, with `type: 17` containers holding `type: 10` content blocks (see the "Discord Components V2" section).

## Discord Components V2 — Webhook Sending

Pelican's `ProcessWebhook` (app/Jobs/ProcessWebhook.php) can send Discord Components V2 messages through the built-in webhook system — no discord.js needed. Key facts:

- `ProcessWebhook` posts `WebhookConfiguration->endpoint` verbatim via `Http::post()`. Discord requires `?with_components=true` on the webhook URL to accept V2 payloads — append it in the endpoint DB column / admin form.
- `flags: 32768` = `IS_COMPONENTS_V2` flag (required, exact value). Container = type 17, text display = type 10.
- An `enrichData()` method (added to `ProcessWebhook`) flattens common context vars to top-level so templates work across event families: `{{ event }}`, `{{ color }}`, `{{ server_id }}`, `{{ server_name }}`, `{{ actor_username }}`, `{{ description }}`, `{{ ip }}`, `{{ timestamp }}`. Missing vars resolve to `''` — never leak the literal key name.
- Per-event accent color via `eventColor()` map (injected as `{{ color }}`): green=power start/restart, red=power stop/kill/file delete, yellow=backup start/restore, purple=backup, blue=file/upload/pull, teal=database, orange=schedule/task, gray=subuser, blurple=default. Use `"accent_color": "{{ color }}"` in payload.
- **Important Discord-side caveat**: this endpoint is a Discord **webhook** URL (`discord.com/api/webhooks/...`), NOT an interaction callback. Webhooks do NOT support components natively — the `?with_components=true` query param tells Discord to parse the body as a V2 payload. Without it, Discord treats the JSON as a regular webhook message and ignores `components`. This is a Discord API quirk, not a Pelican bug.
- **Embeds guard**: `ProcessWebhook` clears bit 2 of `flags` when `embeds` present (`$data['flags'] &= ~(1 << 2)`). Don't mix `embeds` with a V2 payload — V2 messages reject embeds/content and the guard would corrupt the flag.
- **Deploy rule**: after editing `ProcessWebhook.php`, `sudo systemctl restart pelican.service` — the queue worker caches the old class in memory and will not pick up new code otherwise.
- Verify via `webhooks.successful_at` (NULL = Discord rejected) and actual Discord channel delivery.

```bash
# Apply + test:
sudo -u www-data env HOME=/tmp php /var/www/pelican/artisan tinker
# then: $w = WebhookConfiguration::find(ID); $w->payload = [...]; $w->endpoint .= '?with_components=true'; $w->save(); $w->run();
```

## UI Icons & Customization

## UI Icons & Customization

**Pelican Filament uses Tabler icons, NOT Lucide.** Icons are referenced through the `App\Enums\TablerIcon` enum (values are `tabler-*` classes, e.g. `tabler-player-stop-filled`). Do not reach for Lucide or Heroicons — there is no Lucide enum in this codebase.

### Changing a Filament action icon

Power actions in the **server console** (start / restart / stop / kill) are defined as `Action` objects in `app/Filament/Server/Pages/Console.php`, each with a `->icon(TablerIcon::CaseName)` call. To swap an icon:

1. Find the action in `Console.php` (search for `->icon(TablerIcon::`).
2. Pick the replacement case from `app/Enums/TablerIcon.php` (grep the enum for the icon you want, e.g. `grep -n "PlayerStop\|Square\|CircleStop" app/Enums/TablerIcon.php`).
3. Replace the enum case. No migration or rebuild needed — Filament resolves the icon class at render time.

### Console Button Border Radius

To round the Start/Restart/Stop/Kill buttons, use `->extraAttributes(['class' => '!rounded-lg'])` on the `Button` definition in `Console.php`. See [Console Button Styling](references/console-button-styling.md) for full guide with Tailwind class options.

See [Icons & Customization](references/icons-customization.md) for the exact console action block and enum grep patterns.

### CSS Specificity Override Pitfall (Essentials Plugin Theme)

When the **essentials** plugin is installed, its `plugins/essentials/resources/css/theme.css` (and the compiled `public/build/assets/theme-*.css`) contains a high-specificity selector that overrides Tailwind utility classes on the server card:

```css
:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div {
    padding: 1rem 1.15rem; /* overrides p-5, p-3, etc. */
}
```

This means editing `p-3` → `p-5` in Blade templates **has no effect** because the CSS selector wins by specificity. To override it:

1. Append CSS rules with `!important` to `plugins/essentials/resources/css/theme.css`
2. Target the same selector pattern: `:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div`
3. Use `!important` on every property — the theme file's rules have (0,1,1) specificity and no `!important`, so they beat unmarked utilities

After editing `theme.css`, you MUST rebuild: `cd /var/www/pelican && sudo -u www-data npm run build` — this regenerates `public/build/assets/theme-*.css` with the new rules. Skipping `npm run build` means the browser loads the old CSS.

### Editing Blade/View Files

When editing `.blade.php` files under `/var/www/pelican/resources/views/`:

- **`patch` tool permission failures**: files are owned by `www-data:www-data`. The `patch` tool writes a temp file in the same directory — if the directory isn't group-writable, `patch` fails with "Permission denied". Fix: `sudo chgrp -R www-data /var/www/pelican/resources/views/ && sudo chmod -R g+rwX /var/www/pelican/resources/views/`. Alternatively, use `sudo tee` via terminal or `write_file` with group-writable directories.
- After editing **any** view file, clear the view cache: `sudo -u www-data php artisan view:clear`
- Then rebuild CSS: `cd /var/www/pelican && sudo -u www-data npm run build` (needed when CSS theme files change too)
- Restart queue worker: `sudo systemctl restart pelican.service`

### Server List Card Editing

The server list card in Pelican Panel consists of two files:
- **Main card**: `/var/www/pelican/resources/views/livewire/server-entry.blade.php` — header (name/status/power icon), description, and stats row (CPU/RAM/Disk progress bars + network)
- **Progress bar partial**: `/var/www/pelican/resources/views/livewire/columns/progress-bar-column.blade.php` — individual bar styling (height, gap, label spacing)

When customizing the card for a theme (e.g. samurai/bushido), edit both files together. The card's `p-3`/`p-5` controls vertical breathing room, `gap-X` controls spacing between stat bars, and `border-b` on the header row separates name from stats.

**CSS theme override**: the compiled `public/build/assets/theme-*.css` file may contain `[wire\:id]:has(>.fi-color)>.fi-color+div { padding: 1rem 1.15rem }` which overrides all `p-*` utilities. Add override rules to `plugins/essentials/resources/css/theme.css` with `!important`, then run `npm run build`.

### Verify Compiled Views Reflect Changes

After `view:clear` + `cache:clear` + restart, verify the compiled output actually changed by checking `storage/framework/views/*.php` for the new class names/values. If the old values persist, the cache was not fully cleared — repeat `view:clear` and check again. The compiled PHP file is what actually runs, not the source `.blade.php`.

### Deploy Rule (Critical)

After editing **any** PHP source file (controllers, jobs, middleware, Livewire components) **or** Blade view files **or** CSS theme files:

1. Clear view cache: `sudo -u www-data php artisan view:clear`
2. Clear app cache: `sudo -u www-data php artisan cache:clear`
3. Rebuild CSS assets: `cd /var/www/pelican && sudo -u www-data npm run build`
4. Restart queue worker: `sudo systemctl restart pelican.service`

Without steps 1–4, new Blade templates, PHP code, and CSS do not run — the old compiled version keeps serving. This applies to **view files and CSS too** — `view:clear` and `npm run build` are required, not just `php artisan optimize:clear`.

## References

- [Permission Fix Pattern](references/permission-fix.md) — detailed chgrp/chmod commands and troubleshooting
- [Plugin Install Guide](references/plugin-install.md) — step-by-step plugin installation with common errors
- [Nginx Dotfile Fix](references/nginx-dotfiles.md) — removing the 403 rule for file manager access
- [Disk Migration Checklist](references/disk-migration.md) — what to update when the panel moves to a new disk/path
- [Icons & Customization](references/icons-customization.md) — where server-console power-action icons live and how to swap them using the TablerIcon enum
- [Webhook Debugging](references/webhook-debugging.md) — Discord webhook failure chain, fixes, and verification
- [Components V2 Webhook Pattern](references/components-v2-webhook-pattern.md) — send Components V2 via Pelican webhooks: payload template, {{ color }}/{{ server_id }} vars, deploy rule
- [Console Button Styling](references/console-button-styling.md) — border-radius and Tailwind styling for console action buttons
- [File Permissions](references/permission-fix.md) — chgrp/chmod patterns for editing panel files including Blade views
- [Essentials Theme Override](references/essentials-theme-override.md) — CSS specificity issue with [wire\:id]:has(>.fi-color) selector overriding Tailwind utilities, fix via theme.css + !important
