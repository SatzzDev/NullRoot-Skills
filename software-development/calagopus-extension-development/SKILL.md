---
name: calagopus-extension-development
description: Use when building Calagopus .c7s.zip panel extensions.
tags: [calagopus, rust, react, typescript, game-server, panel-extension]
---

# Calagopus Extension Development

## Overview

Calagopus panel extensions (`.c7s.zip`) combine React/TypeScript frontend and Rust backend code. Extensions require the **heavy-aio** Docker image (includes build toolchain) or a full development environment.

## Extension Structure

```
my-extension/
├── Metadata.toml          # REQUIRED: package metadata
├── backend/
│   ├── Cargo.toml        # REQUIRED: Rust package definition
│   └── src/
│       └── lib.rs        # REQUIRED: must export ExtensionStruct
├── frontend/
│   ├── package.json      # REQUIRED: dependencies
│   ├── public/           # OPTIONAL: static assets (served at /<filename>)
│   └── src/
│       ├── index.ts      # REQUIRED: must export Extension class
│       ├── app.css       # OPTIONAL: global styles
│       └── translations.ts  # OPTIONAL: i18n strings
└── migrations/           # OPTIONAL: database migrations
    └── YYYYMMDDHHMMSS_name/
        ├── up.sql
        └── down.sql
```

## Package Naming Convention

**Critical**: Use dots in `Metadata.toml`, underscores everywhere else.

- **Package name**: `com.author.extensionname` (Java-style, lowercase, dots)
- **Package identifier**: `com_author_extensionname` (underscores replace dots)
- Use identifier in: `Cargo.toml` name, backend directory name, database table prefixes

## Required Files

### Metadata.toml

```toml
package_name = "com.author.extensionname"  # dots
name = "Human Readable Name"
panel_version = ">=1.1.0"  # Must exclude pre-1.1.0 panels
```

**Panel version requirement is enforced.** Requirements like `>=1.0.0` that admit pre-1.1.0 panels are rejected outright.

### backend/Cargo.toml

```toml
[package]
name = "com_author_extensionname"  # underscores
description = "Short description"
authors = ["Your Name"]
version = "1.0.0"
edition = { workspace = true }

[dependencies]
shared = { workspace = true }
async-trait = { workspace = true }
tracing = { workspace = true }
```

### backend/src/lib.rs

```rust
use shared::{State, extensions::Extension};

#[derive(Default)]
pub struct ExtensionStruct;  // Must be named ExtensionStruct

#[async_trait::async_trait]
impl Extension for ExtensionStruct {
    async fn initialize(&mut self, _state: State) {
        tracing::info!("Extension initialized");
    }
    
    // More methods: https://cratedocs.calagopus.com/shared/extensions/trait.Extension
}
```

### frontend/package.json

```json
{
  "name": "extension",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "shared": "workspace:*"
  }
}
```

All panel dependencies are already available. Add new dependencies only if needed.

### frontend/src/index.ts

```typescript
import { Extension, ExtensionContext } from 'shared';
import type { MantineThemeOverride } from '@mantine/core';

class ComAuthorExtensionnameExtension extends Extension {
  public cardConfigurationPage: React.FC | null = null;
  public cardComponent: React.FC | null = null;
  public cardIcon: React.ReactNode = null;

  public initialize(ctx: ExtensionContext): void {
    console.log('Extension initialized', ctx);
  }

  public initializeMantineTheme(ctx: ExtensionContext): MantineThemeOverride {
    return {};
  }

  public processCall(ctx: ExtensionContext, name: string, args: object): unknown {
    return ctx.skip();  // Pass to next extension if call doesn't match
  }

  // More methods: https://typedocs.calagopus.com/classes/extensions_shared_src_extension.Extension
}

export default new ComAuthorExtensionnameExtension();
```

## Development Workflow

### 1. Start from Template

If working with official Calagopus repo:
```bash
panel-rs extensions init com.author.extensionname
```

If working with a template `.c7s.zip`, inspect it first, then extract it once:
```bash
mkdir -p ~/calagopus-extensions/my-extension
unzip template.c7s.zip -d ~/calagopus-extensions/my-extension
cd ~/calagopus-extensions/my-extension
```

Treat the template as the source baseline; check its manifest, frontend entry point, and Cargo fields before customizing.

### 2. Customize Package Identity

Update all three files:
- `Metadata.toml`: `package_name = "com.newauthor.newname"`
- `backend/Cargo.toml`: `name = "com_newauthor_newname"`
- `frontend/src/index.ts`: Class name (convention, not required)

### 3. Implement Features

For existing-panel UI changes, inspect the host component that renders the target control before choosing an extension registry slot. Compare the registry slots with the actual DOM order; a slot named `fileToolbar` may render beside New while Search is rendered by a separate breadcrumb/header component. When an exact adjacent position is required and the host exposes no matching slot, render the extension control through a portal into the host control's parent, and remove the old registry registration so duplicate controls cannot appear. Locate the target by a stable semantic signal (for example, button label or an accessible attribute), observe the host subtree for late mounts, and clean up the `MutationObserver` on unmount.

When hiding or renaming entries in intercepted API responses, filter internal names before applying display-name transformations. Normalize with trim plus case-folding and include every configured/localized display variant; otherwise a renamed `Trash Bin` entry can evade a filter that only checks `.trashbin`.

For file-list customization, decide separately whether the entry should be hidden, pinned, or merely made non-draggable. Inspect the host row component and its drag hook before implementing the behavior: CSS can hide a row but cannot reliably disable drag handlers, and changing the list store from a mounted component can create a fetch/render loop. Prefer an official row/entry transformation hook; if none exists, apply a single idempotent transformation keyed to the source pagination/request and preserve pagination metadata. Verify refresh, navigation, pagination, loading quiescence, selection, and drag/drop in the actual panel before shipping.

**CSS hiding rows by entry name:** When using `:has(input[id="..."])` selectors to hide file-list rows, verify the actual `id` attribute value in the rendered DOM. Calagopus file manager checkboxes typically use the relative path (e.g., `/.trashbin`) as the `id`, not the bare folder name (e.g., `.trashbin`). Match both the bare name and path-suffixed variants: `tr:has(input[id=".trashbin"]), tr:has(input[id$="/.trashbin"])` ensures the selector catches entries at any nesting level.

**CSS `:has()` does not match hidden children:** The `:has()` pseudo-class only matches elements whose descendant selectors match visible DOM nodes. If `initializeMantineTheme()` hides a checkbox with `display: none`, then `tr:has(input[id=".trashbin"])` will never match because the `<input>` is not rendered. Remove Mantine theme overrides that hide the same element the CSS selector depends on, or target the row directly without `:has()`. Test the selector in DevTools Console (`document.querySelector('tr:has(input[id=".trashbin"])')`) before building; if it returns `null` but the checkbox exists, check whether the checkbox is `display: none`.

**The working pattern for hiding a folder from file-list views:** Filter `response.data.entries.data` in the Axios response interceptor for `/files/list`, removing the target entry by exact name match (e.g., `.trashbin`). This prevents the row from rendering at all, eliminating drag handlers, selection issues, and empty-row artifacts. Guard the filter with path-context checks so the folder still appears when the user navigates inside it: check `response.data.directory` or the request URL path and skip filtering when already inside the target folder. Test pagination, loading quiescence, drag/drop, and selection after filtering to confirm the virtualizer does not loop.

**Frontend capabilities:**
- Dashboard widgets (cardComponent)
- Custom admin pages (via ExtensionRegistry)
- Theme customization (initializeMantineTheme)
- Event handlers
- Inter-extension calls (processCall)

**Backend capabilities:**
- API routes
- Background tasks
- CLI commands
- Database access
- Permissions

**Key documentation:**
- Frontend: https://typedocs.calagopus.com/classes/extensions_shared_src_extension.Extension
- Backend: https://cratedocs.calagopus.com/shared/extensions/trait.Extension
- File structure: https://calagopus.com/docs/panel/extensions/file-structure

### 4. Validate and Export Extension

Run validation from the Panel repository root, where the extension is registered:
```bash
cargo fmt
cargo clippy
cd frontend
pnpm biome:fix-unsafe
pnpm build:ci
cd ..
```

Create the distributable archive with the official exporter:
```bash
panel-rs extensions export com.author.extensionname
ls -lh ./exported-extensions/
```

The exporter writes the `.c7s.zip` to `./exported-extensions/` and uses the underscored package identifier in the filename. A manually zipped source tree is staging material, not an official release.

### 5. Install Extension

**Requires a heavy image with the extension build toolchain**, such as `:heavy` or `:nightly-heavy` (use the deployment's supported heavy-aio equivalent when applicable). Standard images do not compile extensions. See `self-host-vps-services` skill for switching images.

**Method 1: Admin UI Upload**
1. Navigate to Admin → Extensions
2. Upload `.c7s.zip` file
3. Panel installs, compiles, and loads automatically
4. Watch build logs in UI

**Method 2: Direct Placement**
```bash
# Copy to extensions directory
scp my-extension.c7s.zip root@vps:/path/to/calagopus/build/extensions/

# Restart container
ssh root@vps 'cd /path/to/calagopus && docker compose restart web'
```

Panel detects new file on startup and installs it. After restarting, wait for the build job to finish and inspect the current build log; treat the extension as deployed only when the log contains both the extension's `Compiling <identifier>` line and a successful `Finished ... profile` line. Do not use an older failed log as evidence of the new build. A successful Rust/frontend build proves compilation only; for file-manager UI changes, also perform a fresh browser load and test the exact requested position, row visibility/order, loading settling, selection, and drag behavior.

## Database Migrations (Optional)

Create migration:
```bash
panel-rs database-migrator create com.author.extensionname
```

Structure:
```
migrations/
└── 20260909182300_create_tables/
    ├── up.sql    # Apply migration
    └── down.sql  # Rollback migration
```

**Naming convention**: Prefix tables with package identifier to avoid conflicts.
```sql
-- up.sql
CREATE TABLE IF NOT EXISTS com_author_extensionname_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Troubleshooting

### Build Failures

**Package identity mismatch during Cargo workspace build**
- Derive one identifier mechanically from `Metadata.toml`: replace every dot in `package_name` with an underscore, with no extra or missing separators.
- Require that identifier to match both `backend/Cargo.toml` `[package].name` and the backend directory name registered by the panel.
- Before uploading, verify the archive directly: `unzip -p extension.c7s.zip backend/Cargo.toml | grep '^name'` and compare it with the expected identifier.
- Read the first Cargo error in the remote build log; a message such as `no matching package named ...` means the workspace registration and Cargo package names disagree, not that Rust dependencies are missing.

**Panel version requirement allows older panels**
- Update `Metadata.toml` panel_version to `>=1.1.0` or higher
- 1.1.0 is minimum for extension API

**Build stuck on compiling with idle CPU**
- Click Cancel build then Retry build in Admin UI
- Or restart container: `docker compose down && docker compose up -d`

**504 timeout or build killed**
- Container out of memory (Rust compilation is heavy)
- Give container 8+ GB RAM or add swap
- Check logs: Admin → Extensions → View build logs

**Extension frontend missing after install**
- Reload browser page
- Clear browser cache

### Runtime Issues

**Extension builds but does nothing**
- Verify `backend/Cargo.toml` name uses underscore identifier
- Check backend logs for initialization errors: `docker compose logs web`
- Verify frontend class is exported: `export default new MyExtension()`

**Extension shows infinite loading or initialization error**
- Open browser DevTools console and check for `ReferenceError` or undefined component errors
- If a component referenced in `initialize()` is not defined above the class, extension init fails silently and no UI hooks register
- Define all React components (guards, buttons, interceptors) before the Extension class definition
- After fixing, increment version, rebuild, upload, restart container, and hard-refresh browser (`Ctrl+Shift+R`)

**Frontend crashes with useAuth error**
- Broken extension corrupted frontend bundle
- Stop container, delete extension from `build/extensions/`
- Remove `build/binaries/`, restart: `docker compose up -d --force-recreate`

## Common Pitfalls

**Mixing dots and underscores**: Use dots in Metadata.toml package_name only. Everywhere else (Cargo.toml, directory names, database tables) use underscores. The panel enforces this.

**Confusing a staging ZIP with an exported release**: Use `panel-rs extensions export <dotted_package_name>` from the Panel repository after frontend and Rust checks pass; the exporter assembles the archive and normalizes its output name.

**Claiming an install without a verifiable result**: Confirm the upload target, restart/build operation, and resulting Panel build log or installed-extension state before reporting success; a local archive only proves packaging.

**Theme changes in the wrong layer**: Put Mantine palette, typography, radius, and component defaults in `initializeMantineTheme()`, and reserve `app.css` for global tokens and styling Mantine does not expose.

**Using a nearby registry slot for an exact UI position**: Read the host component and verify rendered DOM order before registering a component. Registry names describe extension insertion points, not necessarily the visual control the user means; use a portal into the target control's parent when no official slot is adjacent.

**Leaving the old slot registration after adding a portal**: Remove the original toolbar/action registration when relocating the same control. Keeping both registrations creates duplicate buttons in two UI locations.

**Filtering after display-name rewriting**: Filter raw internal and localized names case-insensitively before renaming entries. Rewriting first can make the original internal-name check unreachable and leave the hidden folder visible.

**Hiding folders from file lists when CSS fails repeatedly**: When CSS selectors (`:has()`, attribute selectors) fail after 2-3 attempts due to Mantine theme overrides or dynamic rendering, filter `response.data.entries.data` in the Axios response interceptor for `/files/list` by exact name match (e.g., `.filter(entry => entry.name !== '.trashbin')`). This prevents the row from rendering at all, eliminating drag handlers, selection bugs, and empty-row artifacts. Guard the filter with path-context checks so the folder still appears when the user navigates inside it: check if `response.data.directory` contains the target folder name before applying the filter (e.g., `if (!response.data.directory?.includes('.trashbin')) { response.data.entries.data = response.data.entries.data.filter(...) }`). Test pagination, loading settling, drag/drop, and selection after deploying to confirm the virtualizer does not loop.

**Writing filtered entries back from an unguarded React effect**: Do not call `setBrowsingEntries` on every render or whenever the whole pagination object changes. Compare the source entry identity/version, make the transform idempotent, and preserve the original page/per-page metadata; otherwise the guard can repeatedly replace state and keep the file list loading.

**Assuming a hidden row is non-draggable**: Removing a row visually does not change `useDraggedFileMove` handlers, and moving it to the top does not prevent drops onto it. Disable the drag source/target in the host row or intercept the drag/drop callbacks explicitly, then test both dragging the special entry and dropping another entry onto it.

**Panel version too permissive**: `panel_version = ">=1.0.0"` is rejected because it admits pre-1.1.0 panels. Always require `>=1.1.0` minimum.

**Wrong image variant**: Extensions require `:heavy` or `:heavy-aio` image. Standard images lack build toolchain and fail with missing binaries error.

**Missing ExtensionStruct export**: Backend must export a struct named exactly `ExtensionStruct` implementing `Extension` trait and `Default`. Other names are not recognized.

**Missing default export**: Frontend must `export default new YourExtension()`. Named exports or missing export causes silent load failure.

## Extension Marketplace

As of September 2026, Calagopus extension ecosystem is new. Official sources:
- **BuiltByBit**: https://builtbybit.com/resources/categories/calagopus-extensions.100/
- **Calagopus Discord**: https://discord.gg/uSM8tvTxBV
- **GitHub**: Search calagopus extension (limited availability)

For users: Build custom extensions rather than wait for marketplace maturity.
