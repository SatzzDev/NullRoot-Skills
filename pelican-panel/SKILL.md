---
name: pelican-panel
description: Use when administering a Pelican panel (pelican.dev).
---

# Pelican Panel Administration

Pelican panel is a PHP/Laravel-based game server panel. This skill covers common administrative tasks, permission management, and troubleshooting.

## Permission Model

Pelican runs PHP-FPM as `www-data`. The panel source lives at `/srv/pelican/` and must be writable by both the admin user (for SSH edits/composer) and `www-data` (for web-based plugin install, file manager writes, `.env` saves).

**Recommended ownership pattern:**
```bash
sudo chown -R <admin>:www-data /srv/pelican
sudo chmod -R g+rwX /srv/pelican
sudo find /srv/pelican -type d -exec chmod g+s {} +
```

This makes `www-data` the group, with setgid bit so new files inherit the group.

**Why it matters:**
- `.env` save via web Settings page → `file_put_contents` fails without group write
- Plugin install (composer/yarn) → fails if `node_modules` not owned by www-data
- File manager writes to server files → need group write on container paths

## Plugin Installation

Plugins are installed via artisan but run in the PHP/web context.

**Correct approach:**
```bash
# Ensure www-data owns node_modules and yarn cache
sudo chown -R www-data:www-data /srv/pelican/node_modules
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn

# Run install as www-data
cd /srv/pelican
sudo -u www-data php artisan p:plugin:install <plugin-name>
```

**Why:** Running as your admin user creates files owned by you, which www-data can't write later. The artisan command triggers composer install + yarn build internally.

**List plugins:**
```bash
php artisan p:plugin:list
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

## Common Maintenance

**Clear cache after permission changes:**
```bash
cd /srv/pelican
sudo -u www-data php artisan cache:clear
sudo -u www-data php artisan view:clear
```

**Restart Wings daemon:**
```bash
sudo systemctl restart wings
```

**View logs:**
```bash
# Panel logs
tail -f /srv/pelican/storage/logs/laravel.log

# Wings logs
journalctl -u wings -f
```

## References

- [Permission Fix Pattern](references/permission-fix.md) — detailed chgrp/chmod commands and troubleshooting
- [Plugin Install Guide](references/plugin-install.md) — step-by-step plugin installation with common errors
- [Nginx Dotfile Fix](references/nginx-dotfiles.md) — removing the 403 rule for file manager access
