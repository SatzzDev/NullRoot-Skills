# Pelican Panel Troubleshooting

Common issues beyond the standard deploy recipe.

## nginx Blocks Dotfiles (403 Forbidden)

**Symptom**: In the file manager (e.g., editing a server's `.env` file, opening `.npm`, `.config`), nginx returns `403 Forbidden` with log entries like:
```
access forbidden by rule, client: 127.0.0.1, request: "GET /server/<uuid>/files/edit/.env/"
```

**Cause**: The default nginx security rule blocks all dotfiles:
```nginx
location ~ /\.(?!well-known).* {
    deny all;
}
```

**Fix**: Remove or comment out that rule from `/etc/nginx/sites-enabled/pelican`, then reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ **Security note**: This rule exists to prevent access to sensitive files. The Pelican panel handles authentication via PHP, so removing it for the panel's own file manager is acceptable. Do NOT remove it on a shared/public-facing server.

## Plugin Missing Interface Method (FatalError)

**Symptom**: Admin panel crashes with:
```
Class <PluginName> contains 1 abstract method and must therefore be declared
abstract or implement the remaining methods (<Interface>::<method>)
```

**Cause**: A plugin implements a PHP interface (e.g., `HasPluginSettings`) but doesn't implement all required methods from that interface. Common with third-party plugins written for older API versions.

**Fix**: Add the missing method(s) to the plugin class. For `HasPluginSettings`, ensure the plugin has both:
- `getSettingsForm(): array` — returns Filament form components
- `getSettingsFormData(): array` — returns current settings values

Example minimal implementation:
```php
public function getSettingsFormData(): array
{
    return [
        'message' => config('donations.message', ''),
        'links' => json_decode(config('donations.links', '[]'), true) ?? [],
    ];
}
```

After editing the plugin file, clear caches:
```bash
cd /var/www/pelican
sudo -u www-data php artisan optimize:clear
```

## Confusing Panel `.env` vs Container `.env`

When the user says "I can't access .env", clarify **which** `.env`:
- `/var/www/pelican/.env` — the **panel's own** config (DB, Redis, etc.)
- `/home/container/.env` or similar — a **game server's** config inside a Docker container

The panel's file manager edits the latter, but nginx dotfile blocking prevents it (see above). The panel's own `.env` is edited via SSH/terminal, not the web UI.

## `file_put_contents(... .env): Permission denied`

If the web UI fails to save settings:
- Panel's own `.env`: `sudo chown www-data:www-data /var/www/pelican/.env` (and ensure parent dir allows traversal)
- Container `.env`: The container is managed by Wings; use the panel's file manager (after fixing nginx dotfiles) or Wings console, not direct SSH.

## Plugin Install Hangs at "Installing..."

Plugin install from the admin UI can hang indefinitely. Check `plugins/<id>/plugin.json` → `meta.status` for the actual error. Common causes:
- `node_modules` not owned by www-data → `EACCES` in yarn build
- `/var/www/.cache/yarn` not writable → harmless fallback warning
- `storage/logs/laravel.log` not writable → artisan CLI fails to log

Full fix sequence:
```bash
sudo chown -R www-data:www-data /var/www/pelican/node_modules
sudo mkdir -p /var/www/.cache/yarn && sudo chown -R www-data:www-data /var/www/.cache/yarn
sudo chown www-data:www-data /var/www/pelican/storage/logs/laravel.log
# Then retry install from UI or via CLI:
cd /var/www/pelican && sudo -u www-data php artisan p:plugin:install <plugin-id>
```

## Wings config.yml Permission Denied

**Symptom**: Wings fails to start with:
```
error while reading configuration file: open /etc/pelican/config.yml: permission denied
```

**Cause**: After `wings configure` or manual edits, the config file may have wrong ownership.

**Fix**:
```bash
sudo chown root:root /etc/pelican /etc/pelican/config.yml
sudo chmod 644 /etc/pelican/config.yml
sudo systemctl restart wings
```

## Console UI Text Touches Right Edge (xterm.js)

**Symptom**: In the server console widget, terminal output text is flush against the right edge of the container with no breathing room. The command input's `>>` icon is also flush-left with no gap before "Type a command...".

**Cause**: The `.xterm-rows > div` CSS has `padding-left/right: 10px` which is insufficient, and the input area has no horizontal padding.

**Fix**: Edit `resources/css/console.css` in the panel directory — increase the row padding and add input spacing:
```css
.xterm .xterm-rows > div {
    padding-left: 16px;
    padding-top: 2px;
    padding-right: 16px;
}

#send-command {
    padding-left: 8px;
}
```

Then rebuild Vite assets: `cd /var/www/pelican && sudo -u www-data npm run build`

> **Important**: Do NOT fix this by adding padding to the `#terminal` container div — that shifts the entire xterm canvas and misaligns the cursor. The fix must target the `.xterm-rows > div` elements inside the xterm viewport.

**Blade view**: The console component lives at `resources/views/filament/components/server-console.blade.php`. The input bar is a simple `<div class="flex items-center w-full border-top ...">` containing an `<x-filament::icon icon="tabler-chevrons-right" />` and an `<input id="send-command" ...>`. The `>>` icon comes from the `tabler-chevrons-right` icon.
