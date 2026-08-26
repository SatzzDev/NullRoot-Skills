# Blueprint Recovery Procedure

When Blueprint framework breaks the panel (overwrites configs, missing deps, invalid extensions), use this procedure to recover.

## Symptoms
- `yarn build:production` fails with `crypto-browserify` / `pathe` missing
- Panel 500: `array_filter(): Argument #1 ($array) must be of type array, null given` in `BlueprintBaseLibrary.php`
- Missing `@blueprint` components: `Module not found: Error: Can't resolve '@blueprint/components/...'`
- Panel whitescreen or 503 after Blueprint install

## Root Cause
Blueprint's release.zip **overwrites** these critical files:
- `package.json` → loses `lucide-react`, custom deps
- `webpack.config.js` → loses polyfill fallbacks, custom aliases
- `yarn.lock` → desyncs from custom deps
- `tsconfig.json` → may change paths
- Injects `@blueprint` imports into `App.tsx`, `routers/*.tsx`

## Recovery Steps

### 1. Remove Invalid Extensions
```bash
cd /var/www/pterodactyl
rm -rf .blueprint/extensions/recolor
echo "" > .blueprint/extensions/blueprint/private/db/installed_extensions
```

### 2. Fix BlueprintBaseLibrary.php
File: `app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php`

Around line 351, cast `$conf` to array before `array_filter`:
```php
// Before (breaks on null):
$collection->push(array_filter($conf, fn($k) => !!$k));

// After (safe):
$collection->push(array_filter((array)$conf, fn($k) => !!$k));
```

### 3. Restore Config Files from Backup
```bash
# From pre-Blueprint backup (e.g., /home/saturia/backups/pterodactyl-repo/)
cp /home/saturia/backups/pterodactyl-repo/package.json .
cp /home/saturia/backups/pterodactyl-repo/webpack.config.js .
cp /home/saturia/backups/pterodactyl-repo/tsconfig.json .
cp /home/saturia/backups/pterodactyl-repo/babel.config.js .
chown www-data:www-data package.json webpack.config.js tsconfig.json babel.config.js
```

### 4. Install Missing Polyfill Deps
Blueprint's webpack config needs these at config-load time:
```bash
yarn add crypto-browserify@^3.12.1 pathe@^1.1.1 --dev
```

### 5. Reinstall Deps + Rebuild
```bash
yarn install --frozen-lockfile
NODE_OPTIONS=--openssl-legacy-provider yarn build:production
chown -R www-data:www-data storage bootstrap/cache public/assets
```

### 6. Re-apply Custom Theme (Tailwind + GlobalStylesheet)
Ensure `tailwind.config.js` has gold palette + Cinzel font, and `GlobalStylesheet.ts` has gold scrollbar + Cinzel font import. Rebuild:
```bash
NODE_OPTIONS=--openssl-legacy-provider yarn build:production
chown -R www-data:www-data storage bootstrap/cache public/assets
php artisan view:clear && php artisan config:clear
```

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:80/` → `200`
- `grep -c "d4af37\|Cinzel" public/assets/bundle*.js` → non-zero
- `grep -c "Cinzel" public/assets/bundle*.js` → non-zero