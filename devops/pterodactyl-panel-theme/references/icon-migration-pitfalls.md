# Icon Migration Pitfalls (FontAwesome/Heroicons → lucide-react)

Session: 2026-08-24. Bulk-migrated 36 files in Pterodactyl React frontend.

## White screen after migration = JSX spacing error

The bulk-replace script (`scripts/migrate-to-lucide.py`) strips props like `fixedWidth`,
`size`, `color` from `<FontAwesomeIcon>` tags. When the remaining props are concatenated,
the resulting JSX often lacks a space between `icon="..."` and the next prop:

```tsx
// WRONG — crashes React with white screen
<Icon icon="ArrowDownCircle"css={tw`w-3 h-3 mr-2`} />
<Icon icon="Cpu"$alarm={alarms.cpu} />

// CORRECT
<Icon icon="ArrowDownCircle" css={tw`w-3 h-3 mr-2`} />
<Icon icon="Cpu" $alarm={alarms.cpu} />
```

### Fix (run after every bulk migration)
```bash
cd /var/www/pterodactyl
for f in $(grep -rl 'icon="[^"]*"[a-z$]' resources/scripts/); do
    cp "$f" "/tmp/$(basename $f)"
    sed -i 's/icon="\([^"]*\)"css/icon="\1" css/g' "/tmp/$(basename $f)"
    sed -i 's/icon="\([^"]*\)"\$/icon="\1" $/g' "/tmp/$(basename $f)"
    sudo cp "/tmp/$(basename $f)" "$f"
done
```

## Naming conflict: lucide icon vs TypeScript type

Pterodactyl defines types like `Server`, `Clock`, `Database`. `lucide-react` exports
components with the same names. Importing both causes a build error:

```tsx
// WRONG — "Server" is both a type and a component
import { Server } from '@/api/server/getServer';
import { Server } from 'lucide-react';  // ❌ conflict
```

### Fix: use aliased import
```tsx
import { Server } from '@/api/server/getServer';
import { Server as ServerIcon } from 'lucide-react';  // ✅
declare const server: Server;  // type usage
return <ServerIcon />;         // component usage
```

Affected icons in this codebase: `Server`, `Clock`, `Database`, `HardDrive`, `Cpu`.
Always check for type collisions after adding new lucide imports.

## Verify lucide icon exists before using

Not all FontAwesome icons have a direct Lucide equivalent. Verify with:
```bash
node -e "const L = require('lucide-react'); console.log(!!L.SomeIconName)"
```

Common mappings that needed custom choices:
| FontAwesome | Lucide (chosen) |
|-------------|-----------------|
| faCogs | Settings |
| faLayerGroup | Layers |
| faSignOutAlt | LogOut |
| faSyncAlt | RefreshCw |
| faAngleDoubleLeft | ChevronsLeft |
| faAngleDoubleRight | ChevronsRight |
| faCloudUploadAlt | CloudUpload |
| faWifi | Wifi |
| faClipboardList | Clipboard |
| faShieldExclamation | ShieldAlert |
| faBoxOpen | PackageOpen |
| faFileDownload | FileDown |
| faToggleOn | ToggleRight |
