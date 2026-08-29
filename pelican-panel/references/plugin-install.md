# Plugin Installation Guide for Pelican Panel

## The Problem

Installing plugins via the Pelican web admin or artisan fails with:
- `Could not import plugin`
- `mkdir(): Permission denied`
- `EACCES: permission denied, mkdir '/srv/pelican/node_modules/...'`
- `Could not install yarn dependencies`

## Root Cause

Plugin installation runs PHP artisan commands internally, which execute as `www-data`. If `node_modules` or other directories are owned by the admin user, the install fails.

## The Fix

### Prerequisites

```bash
# Ensure node_modules is owned by www-data
sudo chown -R www-data:www-data /srv/pelican/node_modules
# Ensure yarn cache is writable
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn
```

### Install via Artisan (Recommended)

```bash
cd /srv/pelican
sudo -u www-data php artisan p:plugin:install <plugin-name>
```

### Install via Web Admin

1. Go to Pelican admin → Plugins
2. Search for the plugin
3. Click Install
4. If it fails, check `/srv/pelican/storage/logs/laravel.log`

### Verify Installation

```bash
php artisan p:plugin:list
```

## Common Errors

### `EACCES: permission denied, mkdir '/srv/pelican/node_modules/@rolldown/...'`

**Cause:** node_modules owned by admin user, not www-data.
**Fix:** `sudo chown -R www-data:www-data /srv/pelican/node_modules`

### `Skipping preferred cache folder "/var/www/.cache/yarn" because it is not writable`

**Cause:** Yarn cache directory not writable by www-data.
**Fix:**
```bash
sudo mkdir -p /var/www/.cache/yarn
sudo chown -R www-data:www-data /var/www/.cache/yarn
```

### `Could not install plugin: file_put_contents(...): Failed to open stream: Permission denied`

**Cause:** Plugin directory not writable by www-data.
**Fix:**
```bash
sudo chown -R www-data:www-data /srv/pelican/plugins/<plugin-name>
```

### `Could not import plugin` after install

**Cause:** Plugin metadata shows `not_installed` with error in `meta.status_message`.
**Fix:** Check the error in `plugin.json`, fix the underlying issue, then reinstall.
