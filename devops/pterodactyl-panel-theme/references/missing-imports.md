# Missing Icon Imports in Stock Pterodactyl Source

Verified 2026-08-25 on stock Pterodactyl 1.15.1. The panel's user-area React
components reference icon components (`FontAwesomeIcon`, `faEthernet`,
`ShieldExclamationIcon`, etc.) as **bare variables without importing them**.
This is NOT caused by theme edits — the source itself is damaged.

## Symptom
After a production build, the user-area React SPA crashes with
`ReferenceError: FontAwesomeIcon is not defined` (or `ShieldExclamationIcon`,
`CloudDownloadIcon`, etc.) when rendering the dashboard or server pages.
Admin area (Blade templates) works fine because it uses a separate stack.

## Root cause
`babel-plugin-styled-components` hoists `styled(<Identifier>)` calls to **module
scope**. When `<Identifier>` is a component that was never imported, it becomes
`undefined` at module scope → `ReferenceError` the instant the bundle evaluates
→ React never mounts → toast "An error was encountered by the application while
rendering this view."

The crash only appears after a production build because:
1. The dev build uses a different babel config that may not hoist as aggressively
2. The production build enables `terser` mangling which can rename variables

## Detection
Scan the production bundle for bare `styled()` references:
```bash
cd /var/www/pterodactyl
node -e '
const fs=require("fs"),path=require("path");
const dir="public/assets";
let bad=0;
for(const f of fs.readdirSync(dir)){
  if(!f.endsWith(".js"))continue;
  const s=fs.readFileSync(path.join(dir,f),"utf8");
  const bare=[...s.matchAll(/\(0,[a-z]\.Ay\)\(([A-Z][A-Za-z0-9_]*)\)/g)]
    .map(m=>m[1]).filter(n=>!["React"].includes(n));
  if(bare.length){console.log("BARE in",f,":",[...new Set(bare)].join(",")); bad+=bare.length;}
}
console.log("total bare styled refs:",bad);
'
```

Any non-zero count = missing import → runtime crash.

## Affected files (verified 2026-08-25)
These files use icon components without importing them:

| File | Missing imports |
|------|-----------------|
| `components/dashboard/ServerRow.tsx` | `FontAwesomeIcon`, `faEthernet` |
| `components/elements/ScreenBlock.tsx` | `FontAwesomeIcon`, `faArrowLeft`, `faSyncAlt` |
| `components/server/features/PIDLimitModalFeature.tsx` | `FontAwesomeIcon`, `faMemory` |
| `components/server/files/FileDropdownMenu.tsx` | `FontAwesomeIcon`, `faFileArchive`, `faFolder`, `faLevelUpAlt` |
| `components/server/files/FileObjectRow.tsx` | `FontAwesomeIcon`, `faFile`, `faFolder` |
| `components/server/schedules/ScheduleTaskRow.tsx` | `FontAwesomeIcon`, `faCalendarAlt` |
| `components/server/backups/BackupContextMenu.tsx` | `FontAwesomeIcon`, `faDownload` |
| `components/server/users/UserRow.tsx` | `FontAwesomeIcon`, `faUserTimes` |
| `components/elements/dialog/DialogIcon.tsx` | `ShieldExclamationIcon`, `ExclamationIcon`, `CheckIcon`, `InformationCircleIcon` (from `@heroicons/react/outline`) |
| `components/server/console/StatGraphs.tsx` | `CloudDownloadIcon`, `DesktopComputerIcon` (from `@heroicons/react/solid`) |
| `components/dashboard/activity/ActivityLogContainer.tsx` | `CloudDownloadIcon` (from `@heroicons/react/solid`) |

## Fix
Add the missing imports to each file, matching upstream Pterodactyl 1.15.1. Reference:
https://github.com/pterodactyl/panel/tree/v1.15.1/resources/scripts/components

For FontAwesome icons:
```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEthernet } from '@fortawesome/free-solid-svg-icons';
```

For Heroicons:
```tsx
import { ShieldExclamationIcon, ExclamationIcon, CheckIcon, InformationCircleIcon } from '@heroicons/react/outline';
import { CloudDownloadIcon, DesktopComputerIcon } from '@heroicons/react/solid';
```

After adding imports, rebuild production:
```bash
cd /var/www/pterodactyl
sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production
sudo chown -R www-data:www-data storage bootstrap/cache public/assets
sudo php artisan view:clear && sudo php artisan config:clear
```

## Verification
After rebuild, re-run the bare-ref scan — should show 0. Then load the dashboard
in headless Chromium and confirm no `ReferenceError` in console.
