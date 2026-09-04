# Permission Fix Pattern for Pelican Panel

## The Problem

Pelican panel runs PHP-FPM as `www-data`, but files may be owned by the admin user (`saturia`). This causes:
- `.env` save fails: `file_put_contents(/srv/pelican/.env): Failed to open stream: Permission denied`
- Plugin install fails: `mkdir(): Permission denied` in Filesystem.php
- File manager writes fail: `EACCES` on node_modules or server container paths

## The Fix

### Step 1: Fix current file ownership

```bash
# chgrp the entire tree to www-data
sudo chgrp -R www-data /srv/pelican
# Add group read/write/execute (setgid on dirs)
sudo chmod -R g+rwX /srv/pelican
# Set setgid bit on all directories so new files inherit the group
sudo find /srv/pelican -type d -exec chmod g+s {} +
```

### Step 2: Fix specific directories that need www-data ownership

```bash
# node_modules must be owned by www-data for yarn builds
sudo chown -R www-data:www-data /srv/pelican/node_modules
# Yarn cache must be writable by www-data
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn
# Storage dirs (logs, framework cache, etc.)
sudo chown -R www-data:www-data /srv/pelican/storage
sudo chown -R www-data:www-data /srv/pelican/bootstrap/cache
```

### Step 3: Fix .env file specifically

```bash
# .env needs to be writable by www-data (PHP web context)
sudo chown <admin>:www-data /srv/pelican/.env
sudo chmod 664 /srv/pelican/.env
```

### Step 4: Clear caches

```bash
cd /srv/pelican
sudo -u www-data php artisan cache:clear
sudo -u www-data php artisan view:clear
sudo -u www-data php artisan config:clear
```

## Why This Happens

- Admin user runs `composer install` or edits files via SSH → files owned by admin
- Web server (www-data) tries to write via plugin install or settings save → permission denied
- The fix: make `www-data` the group, use setgid for inheritance, and ensure critical dirs are owned by www-data

## Troubleshooting

If `chgrp -R` times out (large node_modules), target specific directories:
```bash
sudo chgrp www-data /srv/pelican/.env
sudo chmod g+rw /srv/pelican/.env
```

If artisan commands fail with log permission errors:
```bash
sudo chown www-data:www-data /srv/pelican/storage/logs/laravel.log
```

## Editing Blade/View Files

When editing `.blade.php` files under `/var/www/pelican/resources/views/` via `patch` tool:

- `patch` writes a temp file in the **same directory** as the target file. The directory must be group-writable by `www-data`.
- If `patch` returns "Permission denied" even though the file itself is writable, fix the **directory ownership**:
  ```bash
  sudo chgrp www-data /var/www/pelican/resources/views/<subdir>/
  sudo chmod g+rwX /var/www/pelican/resources/views/<subdir>/
  ```
- Alternatively, fix recursively: `sudo chgrp -R www-data /var/www/pelican/resources/views/ && sudo chmod -R g+rwX /var/www/pelican/resources/views/`
- After editing any view file, clear view cache: `sudo -u www-data php artisan view:clear`
