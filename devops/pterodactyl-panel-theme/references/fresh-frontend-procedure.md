# Fresh Frontend Procedure

## Context (user: "fresh install panelnya dulu")
When Blueprint or a broken build corrupts the frontend, user wants **frontend reset
to stock** while preserving backend (DB, custom code, `.env`, migrations). This is
NOT a full wipe — backend stays intact.

## Procedure (verified 2026-08-26)

### 1. Backup custom files
```bash
cd /var/www/pterodactyl
sudo cp -r public public.custom-backup.$(date +%s)
sudo cp -r resources/scripts resources.scripts.custom-backup.$(date +%s)
sudo cp tailwind.config.js tailwind.config.js.backup
sudo cp resources/scripts/assets/css/GlobalStylesheet.ts GlobalStylesheet.ts.backup
```

### 2. Download stock release
```bash
# Identify current panel version first
head -30 CHANGELOG.md | grep -E "^## " | head -3
# Download matching release (example: v1.12.3)
cd /tmp
wget -q "https://github.com/pterodactyl/panel/releases/download/v1.12.3/panel.tar.gz" \
  -O panel-v1.12.3.tar.gz
tar -xzf panel-v1.12.3.tar.gz
```

### 3. Replace frontend only
```bash
cd /var/www/pterodactyl
sudo rm -rf public resources/scripts
sudo cp -r /tmp/panel-v1.12.3/public .
sudo cp -r /tmp/panel-v1.12.3/resources/scripts resources/
sudo chown -R www-data:www-data public resources/scripts
```

### 4. Restore custom theme
```bash
# Find the most recent backup
BACKUP_DIR=$(ls -d resources.scripts.custom-backup.* | tail -1)

# Restore custom files
sudo cp tailwind.config.js.backup tailwind.config.js
sudo cp "$BACKUP_DIR/assets/css/GlobalStylesheet.ts" \
  resources/scripts/assets/css/GlobalStylesheet.ts
sudo chown www-data:www-data tailwind.config.js \
  resources/scripts/assets/css/GlobalStylesheet.ts
```

### 5. Rebuild
```bash
cd /var/www/pterodactyl
sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production
sudo chown -R www-data:www-data storage bootstrap/cache public/assets
sudo -u www-data php artisan view:clear
sudo -u www-data php artisan config:clear
redis-cli FLUSHALL
```

### 6. Verify
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:80/
# Should be 200

# Verify gold theme
grep -c "d4af37" public/assets/bundle*.js  # should be >0
grep -c "Cinzel" public/assets/bundle*.js  # should be >0
```

## What NOT to replace
- **Backend dirs**: `app/`, `database/`, `routes/`, `config/` — custom backend code stays
- **Environment**: `.env` — DB credentials, APP_KEY, APP_URL preserved
- **Storage**: `storage/` — logs, cache, uploaded files
- **Vendor**: `vendor/`, `node_modules/` — keep existing (or `yarn install` fresh)
- **Blueprint**: `.blueprint/`, `app/BlueprintFramework/` — if you want to keep Blueprint installed

## When to use this vs full reinstall
- **Use fresh frontend** when: Blueprint broke the build, xterm is missing, chunk errors,
  frontend whitescreen — but backend/DB/API work fine
- **Use full reinstall** when: DB schema is corrupted, PHP dependencies broken, Laravel
  throws 500 on every route, supervisor/queue dead

## Pitfall: Blueprint integration
If Blueprint was installed (`app/BlueprintFramework/` exists), fresh frontend will
restore stock `App.tsx`/routers WITHOUT `@blueprint` imports → Blueprint routes 404.
After restore, either:
1. **Uninstall Blueprint** fully (remove `app/BlueprintFramework/`,
   `app/Providers/Blueprint/`, `.blueprint/`, `routes/blueprint*`, revert
   `AppServiceProvider.php`), OR
2. **Re-inject Blueprint** imports into the fresh `App.tsx`/routers (see
   `references/blueprint-recovery.md`)

Fresh frontend = clean slate for **theme only**, not for framework integrations.
