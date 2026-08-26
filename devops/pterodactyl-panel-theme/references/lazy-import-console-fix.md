# ServerConsole Error: Lazy Import Fix

## Symptom
User clicks a server → error boundary: "An error was encountered by the application while rendering this view. Try refreshing the page."

Console error (browser devtools):
```
TypeError: Cannot read properties of undefined (reading 'terminal')
    at J (682.bfe8a8c7.js:1:14367)
    at Object.apply (776.78273f85.js:1:1105775)
    ...
```

Panel loads fine (HTTP 200), home/dashboard work, but **server pages crash**.

## Root Cause
`resources/scripts/routers/routes.ts` imports ServerConsole and other server components **directly** (not lazy):

```typescript
import ServerConsole from '@/components/server/console/ServerConsoleContainer';
import DatabasesContainer from '@/components/server/databases/DatabasesContainer';
// ... etc
```

This forces Console + xterm libs into the **main bundle** instead of lazy chunks → massive bundle, import race conditions, undefined module refs → `.terminal` runtime error when ServerRouter tries to render Console.

Stock Pterodactyl v1.12.x uses `React.lazy()` for all server components to code-split them into separate chunks (e.g. `682.*.js`, `2.*.js`). Direct imports break this.

## How It Happens
- Fresh frontend restore from tarball overwrites `resources/scripts/` with stock
- But if you restore `routes.ts` from an OLD backup (pre-lazy era), you get direct imports
- Or: someone manually edited `routes.ts` and changed lazy to direct (thinking it's simpler)

Result: build succeeds (no compile error), bundle size increases (19 assets → 31 assets when fixed), but **xterm module resolution breaks at runtime**.

## Diagnosis
1. Check bundle asset count after build:
   ```
   webpack 5.103.0 compiled successfully
   19 assets   ← WRONG (direct imports)
   31 assets   ← CORRECT (lazy imports)
   ```

2. Grep `routes.ts` for direct imports:
   ```bash
   grep -n "from '@/components/server" resources/scripts/routers/routes.ts
   ```
   If you see `import ServerConsole from ...` (not `const ServerConsole = lazy(...)`), it's broken.

3. Verify xterm is NOT in main bundle:
   ```bash
   grep -c "loadAddon\|new f.Terminal" public/assets/bundle.*.js
   # Should be 0 (xterm in lazy chunk only)
   ```

## Fix
Replace direct imports with `React.lazy()` in `routes.ts`:

```typescript
import React, { lazy } from 'react';

// Lazy-loaded components for code splitting
const ServerConsole = lazy(() => import('@/components/server/console/ServerConsoleContainer'));
const DatabasesContainer = lazy(() => import('@/components/server/databases/DatabasesContainer'));
const ScheduleContainer = lazy(() => import('@/components/server/schedules/ScheduleContainer'));
const UsersContainer = lazy(() => import('@/components/server/users/UsersContainer'));
const BackupContainer = lazy(() => import('@/components/server/backups/BackupContainer'));
const NetworkContainer = lazy(() => import('@/components/server/network/NetworkContainer'));
const StartupContainer = lazy(() => import('@/components/server/startup/StartupContainer'));
const FileManagerContainer = lazy(() => import('@/components/server/files/FileManagerContainer'));
const SettingsContainer = lazy(() => import('@/components/server/settings/SettingsContainer'));
```

Then rebuild:
```bash
sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production
sudo chown -R www-data:www-data storage bootstrap/cache public/assets
```

Verify: asset count should jump to ~31, xterm should be in chunk `2.*.js` or similar (not main bundle).

## Prevention
- When doing "fresh frontend" restore, check `routes.ts` after extraction — if it has direct imports, restore the lazy version from stock v1.12.x tarball
- Always verify asset count after build: 19 = something wrong, 31 = correct lazy split
- Grep for `import.*from '@/components/server` as part of post-build verification

## Related
- Stock v1.12.3 `routes.ts` uses lazy by default
- ServerRouter wraps routes with `<Spinner.Suspense>` which handles lazy loading
- xterm bundle is ~268KB — forcing it into main bundle bloats initial load + breaks module resolution
