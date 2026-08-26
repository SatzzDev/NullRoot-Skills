---
name: pterodactyl-panel-theme
description: "Theme stock Pterodactyl to gold-dark via Tailwind override."
---

# Pterodactyl Panel Theme (gold-dark)

## When to use
Theming or rebranding a Pterodactyl game panel (e.g. SaturiaHost at
`panel.saturia.codes`) to a gold/dark "premium" look WITHOUT third-party addons
(Blueprint, etc). User explicitly prefers the manual Tailwind-override path over
installing an addon.

**User UX work preference:** When working on UX improvements, **skip admin area**
("bagian admin biarin aja") — focus only on user-facing dashboard, server list,
server console, file manager, and settings. Do NOT work on admin panel
(admin/settings, admin/nests, admin/nodes) unless explicitly asked.

## Environment (verified 2026-08-24)
- Panel root: `/var/www/pterodactyl` — **stock Pterodactyl 1.x**, NOT Jexactyl and
  NOT `/var/www/jexactyl`. (The old `saturiahost-jexactyl-rebrand` skill assumed the
  wrong path and was deleted as wrong.)
- Node 22, yarn at `/home/saturia/.local/bin/yarn`. Build MUST set
  `NODE_OPTIONS=--openssl-legacy-provider` or webpack dies with
  `ERR_OSSL_EVP_UNSUPPORTED`.
- Frontend: React/TS, Tailwind v3, CSS-in-JS via `twin.macro` + `styled-components`.
  Tailwind utility classes (`bg-blue-500`, `text-blue-400`, …) are emitted into the
  **JS bundle**, not a static `.css` file — this changes how you verify the theme.
- Served via Cloudflare Tunnel. DB name `SaturiaHost`; `APP_URL=https://panel.saturia.codes`.
  `APP_NAME` is unset in `.env` (defaults to "Pterodactyl"); set it if rebranding the title.

## Steps
1. Backup before touching anything:
   `sudo cp tailwind.config.js tailwind.config.js.bak-saturia`
   `sudo cp resources/scripts/assets/css/GlobalStylesheet.ts resources/scripts/assets/css/GlobalStylesheet.ts.bak-saturia`
2. Remap `blue`/`primary` to gold in `tailwind.config.js` (see `templates/tailwind.config.js`).
   All `blue-*` utilities across the app become gold automatically — no per-component edits.
3. Darken + gold-tint the chrome in `resources/scripts/assets/css/GlobalStylesheet.ts`:
   - body: `bg-neutral-800 text-neutral-200` → `bg-neutral-900 text-neutral-100`
   - scrollbar thumb: gold `inset` box-shadow (see `templates/GlobalStylesheet.ts`).
4. Ensure deps exist: a freshly extracted `panel.tar.gz` has an EMPTY `node_modules`, so
   `yarn build:production` fails `cross-env: not found`. Run first:
   `sudo NODE_OPTIONS=--openssl-legacy-provider yarn install --frozen-lockfile`
5. Build production:
   `sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production`
6. Fix perms (a sudo build leaves `storage/framework/views` root-owned → HTTP 500):
   `sudo chown -R www-data:www-data storage bootstrap/cache public/assets`
   `sudo -u www-data php artisan view:clear && sudo -u www-data php artisan config:clear`
7. Verify — see `references/verify.md` (grep built `.js` bundle for gold hex + `curl` for 200).
   For a **whitescreen** (blank page, HTTP 200, empty `#app`) run the headless
   diagnostic `scripts/headless-whitescreen-check.js` — it catches JS mount crashes
   that `curl`/`node --check` cannot (see pitfall below + `references/whitescreen-lucideicon.md`).

## Gotchas
- **Path**: `/var/www/pterodactyl` (stock Pterodactyl), never `/var/www/jexactyl`.
- **Empty node_modules**: fresh tarball → `cross-env: not found`; `yarn install` first.
- **Panel 404 after reboot/config change** — if panel returns 404 from both origin and
  Cloudflare, check: (1) nginx config symlink exists in `sites-enabled/`, (2) domain in
  config matches DNS, (3) SSL cert exists for that domain. After domain migration, certbot
  needs to run for the new domain. See `references/nginx-ssl-domain-recovery.md` for full
  recovery procedure + Cloudflare redirect loop fix.
- **Verify in JS, not CSS**: Pterodactyl emits Tailwind utilities into the JS bundle.
  Grep `public/assets/*.js` for `d4af37`, not `*.css`.
- **chown after every sudo build** or the panel 500s on first load. Root cause of a
  sudden HTTP 500 after any rebuild: `sudo yarn build:production` rewrites
  `storage/`, `bootstrap/cache`, `public/assets` as owner `saturia`, so `www-data`
  can no longer write `storage/framework/views`, `storage/framework/sessions`, and
  the log. Fix: `sudo chown -R www-data:www-data storage bootstrap/cache public/assets`
  then `curl -s -o /dev/null -w "%{http_code}" http://localhost:80/` expecting `200`.
  If still 500, confirm the log file itself is `664` + www-data (a 644 log owned by
  www-data still blocks append → `log could not be opened in append mode`).
- **NODE_OPTIONS** legacy provider required on Node 22.
- `public/assets` is wiped every build — persistent brand assets belong in `public/img/`.
- **WHITESCREEN after build — `LucideIcon is not defined`:** `babel-plugin-styled-components`
  (loaded in `babel.config.js`) **hoists any `css` (twin.macro) prop to module scope** as
  `styled(<Identifier>)`. If that `<Identifier>` is a component defined only *inside* a
  render function (dynamic lookup like `LucideIcons[icon]`), it is `undefined` at module
  scope → `ReferenceError` the instant the bundle evaluates → React never mounts → `#app`
  empty → whitescreen (body stays transparent because the dark CSS is injected by the same
  crashed JS). **Never put a `css` prop on a runtime-resolved/dynamic component.** Use a
  plain `style={{display:'inline-block'}}` or `className` instead. Exact bug + fix:
  `references/whitescreen-lucideicon.md`. This fires on the stock `Icon.tsx` too, so a
  rebuild alone can trigger it even if you only changed colors.
- **Headless diagnostic needs its own puppeteer-core:** the panel's node_modules refuse the
  install (react-18 peer conflict). Install `puppeteer-core@23` in a throwaway `/tmp/pptr`
  dir and point the script at it; reuse system `/snap/bin/chromium`.
- **AdminLTE admin area is a separate Bootstrap 3 stack** — it does NOT use Tailwind.
  To theme the admin area (admin/settings, admin/nests, etc.) use the static CSS
  override file `public/themes/pterodactyl/css/saturiahost-admin.css`. See
  `references/admin-button-upgrade.md` and `references/adminlte-override.md`.
- **Repeated CSS edits orphan braces** — after bulk find-replace edits, always count `{`
  vs `}`. Mismatch = silent CSS breakage downstream. Use a stack-based brace checker
  (iterate lines, push on `{`, pop on `}`, report lines where pop fails).
- **User wants to self-service CSS edits** — document file paths + section markers
  so they can edit directly. See `references/admin-button-upgrade.md` for the full
  user-feedback log and final working version of `.content-header` styling.
- **AdminLTE rem = 10px, NOT 16px** — `html { font-size: 10px }` is the rem base.
  Never use `rem` units in `saturiahost-admin.css`; use `px` directly or
  convert rem×16. `0.95rem` becomes `9.5px` (tiny), not `15.2px`. See
  `references/adminlte-rem-pitfall.md`.
- **Frontend chunks are lazy — grep ALL `public/assets/*.js`, not just `bundle.*.js`.**
  Dashboard/account/server screens are code-split via `React.lazy` into separate
  `NNN.longhash.js` chunks (e.g. `455.910203c2.js`, `dashboard.*.js`); `bundle.*.js`
  only holds the entry shell. Grepping only `bundle.*.js` for a component's string
  (e.g. `'Profile Avatar'`) returns 0 and falsely reads as "component not built /
  webpack dropped it" — a wasted rabbit hole. To find a component's chunk, grep every
  `public/assets/*.js` (see `references/custom-avatar-feature.md` for the E2E proof).
- **A persistent upload bug is usually a stale chunk in the user's already-open SPA**
  **tab, not server code.** Verify the SERVER side end-to-end first (curl upload with
  FormData + auto boundary = 200, file on disk, DB updated). If server serves the new
  hashed chunk (`curl -s -I ... | grep -i cache-control`) but the user still sees the
  old error, it's because their tab never reloaded the HTML (SPA navigation doesn't) —
  bundle/chunk from memory is stale. Ask for a FULL page close/reopen or incognito tab;
  a hard refresh is not reliably enough for an open SPA.
- **Cloudflare overrides nginx caching on the public domain.** Behind the tunnel,
  `panel.satzz.online/assets/*.js` serves `cf-cache-status: HIT` /
  `cache-control: max-age=14400` even when nginx has `no-cache, must-revalidate`
  (CF caches hashed assets 4h). HTML itself stays `no-cache, private, DYNAMIC` (CF
  never caches it), so a full page load always fetches fresh HTML → fresh chunk hash.
  Diagnose live caching with: `curl -s -I https://panel.satzz.online/assets/<file> |
  grep -i "cache-control\|cf-cache-status"`. Setting nginx `add_header Cache-Control
  "public, max-age=0, must-revalidate"` on `location ~ ^/assets/` helps revalidation
  on the origin side but does NOT override CF's 4h cache.
- **Memory icon was `Cpu`** — both `ServerDetailsBlock.tsx` and `ServerRow.tsx`
  used `icon="Cpu"` for the Memory stat block. Fixed to `icon="MemoryStick"`
  (available in lucide-react). Requires `yarn build:production` after edit.

- **Blueprint framework overwrites config files** — Installing Blueprint via
  `blueprint.sh` unzips a fresh release which **replaces** `package.json`,
  `webpack.config.js`, `yarn.lock`, `tsconfig.json`, and injects `@blueprint`
  imports into `App.tsx`/`routers`. This **destroys custom theme** (tailwind
  config, GlobalStylesheet, lucide-react deps). After Blueprint install, you
  MUST restore: `package.json` (with lucide-react), `webpack.config.js` (with
  polyfill fallbacks), `tsconfig.json`, and re-add `@blueprint` alias. Then
  `yarn install && yarn build:production`. See `references/blueprint-recovery.md`.

- **Recolor extension is deprecated** — Recolor (sp11rum/recolor) is a Blueprint
  extension but **no updates since 2025-12-21** and targets `beta-2024-12`
  (panel v1.11). Current panel v1.12.x is incompatible. Installing it via
  `blueprint -install recolor` either fails (`Blueprint already installed`) or
  produces a broken extension missing `private/.store/conf.yml` →
  `BlueprintBaseLibrary.php` throws `array_filter(): null given`. **Do not use
  Recolor.** Instead, apply manual Tailwind gold theme (tailwind.config.js +
  GlobalStylesheet.ts) on top of Blueprint.

- **Blueprint recovery procedure** — If Blueprint breaks the panel:
  1. Remove invalid extensions: `rm -rf .blueprint/extensions/recolor &&
     echo "" > .blueprint/extensions/blueprint/private/db/installed_extensions`
  2. Fix BlueprintBaseLibrary.php: cast `$conf` to `(array)` before
     `array_filter` (see `references/blueprint-base-library-fix.md`)
  3. Restore config files from backup: `package.json` (lucide-react),
     `webpack.config.js` (Blueprint's config + polyfills: crypto-browserify,
     pathe), `tsconfig.json`
  4. `yarn install --frozen-lockfile`
  4. Re-apply custom theme: `tailwind.config.js` (gold palette + Cinzel font),
     `GlobalStylesheet.ts` (Cinzel font, gold scrollbar, dark bg)
  5. `yarn build:production` + `chown -R www-data:www-data ...`

- **Tailwind config + GlobalStylesheet must BOTH survive Blueprint build** —
  After Blueprint build, verify BOTH files still contain custom gold palette,
  Cinzel font import, and gold scrollbar. If missing, restore from backup and
  rebuild.

- **Verify in ALL bundle chunks** — After rebuild, grep gold hexes (`d4af37`,
  `9c7010`, `0a0805`) and `Cinzel` in ALL `public/assets/*.js`, not just
  `bundle.*.js`. Dashboard/account chunks are lazy-loaded separately.

- **Fresh frontend strategy (user: "fresh install panelnya dulu")** — To reset
  frontend to stock while preserving backend/DB/custom theme: download panel
  release tarball → extract ONLY `public/` + `resources/scripts/` → overwrite
  those dirs in `/var/www/pterodactyl` → restore custom theme files
  (`tailwind.config.js`, `GlobalStylesheet.ts`) from backup → rebuild. Do NOT
  wipe entire `/var/www/pterodactyl` — that destroys DB, `.env`, migrations,
  supervisor config. This is the preferred approach when Blueprint breaks the
  frontend but backend is intact.

- **xterm Console `.terminal` undefined error** — If ServerConsole throws
  `Cannot read properties of undefined (reading 'terminal')` when user clicks
  a server: **root cause is direct imports in `routes.ts` instead of lazy**.
  Stock v1.12.x uses `React.lazy(() => import(...))` for all server components
  to code-split them into separate chunks. If `routes.ts` has `import
  ServerConsole from '@/components/server/console/ServerConsoleContainer'`
  (direct), Console + xterm are forced into main bundle → module resolution
  breaks → runtime error. **Fix:** replace all server component imports with
  `const ServerConsole = lazy(() => import(...))` pattern (see
  `references/lazy-import-console-fix.md`). After fix, asset count jumps from
  19 → 31 (lazy chunks split correctly). Verify xterm is in chunk `2.*.js` or
  `682.*.js` (not main bundle): `grep -c 'loadAddon' public/assets/2.*.js`
  should be >0.

- **User built while agent was working** — If you complete a build and verify
  bundle hash `ABC123.js`, but user reports error with bundle `XYZ456.js`
  (different hash), the user triggered another build after yours (maybe via
  Blueprint, maybe manual `yarn build`). The error is NOT in your build — it's
  in theirs. Check modification time: `stat -c '%y'
  public/assets/bundle.XYZ456.js` vs your build timestamp. If user's build is
  newer, rebuild once more to replace their broken one.

- **CSS modules `manager_actions` undefined / style object undefined** — If
  FileManager (chunk 18) or other components throw `Cannot read properties of
  undefined (reading 'manager_actions')` or similar CSS class name, **webpack
  CSS modules support is missing**. Stock v1.12.3 `webpack.config.js` has
  `css-loader` with `modules: { auto: true, localIdentName: '[name]_[hash]' }`
  for `.module.css` files. Blueprint's webpack config LACKS this → `import
  style from './style.module.css'` returns `undefined` → component crashes on
  `style.manager_actions`. **Fix:** restore stock webpack CSS loader config
  (extract from `panel-v1.12.3.tar.gz`), OR manually add to current
  webpack.config.js under `test: /\.css$/` loader options: `modules: { auto:
  true, namedExport: false, exportLocalsConvention: 'as-is', localIdentName:
  isProduction ? '[name]_[hash:base64:8]' : '[path][name]__[local]',
  localIdentContext: path.join(__dirname, 'resources/scripts/components') }`.
  Must keep Blueprint's `fallback` polyfills (`crypto`, `pathe`) intact — only
  replace CSS loader block. After fix, verify CSS hash pattern exists in
  chunks: `grep -o 'style_[a-zA-Z0-9]*' public/assets/18.*.js | head` should
  show hashed classes. See `references/css-modules-webpack-fix.md`.

## Files
- `templates/tailwind.config.js` — gold palette override.
- `templates/GlobalStylesheet.ts` — dark body + gold scrollbar.
- `references/verify.md` — verification recipe.
- `references/whitescreen-lucideicon.md` — `LucideIcon`/`css`-prop hoist.
- `references/admin-button-upgrade.md` — metallic gold button CSS + **user feedback log**.
- `references/adminlte-override.md` — AdminLTE dark/gold override.
- `references/icon-migration-pitfalls.md` — FontAwesome → Lucide pitfalls.
- `references/admin-lucide-icons.md` — Lucide icon usage in admin.
- `references/missing-imports.md` — missing import ReferenceError pattern.
- `references/custom-avatar-feature.md` — user profile-picture upload feature + the
  critical axios multipart boundary pitfall.
- `references/backup-restore-github.md` — backup to GitHub + self-contained
  `install.sh` 1-command VPS restore (private repo, SATZZDEV_GITHUB token).
- `references/fresh-frontend-procedure.md` — reset frontend to stock release while
  preserving backend/DB (user: "fresh install panelnya dulu"); extract + overwrite
  public/ + resources/scripts/ only, restore theme, rebuild.
- `references/blueprint-recovery.md` — Blueprint framework overwrites configs;
  full recovery procedure (restore files, fix polyfills, re-apply theme).
- `references/blueprint-base-library-fix.md` — `array_filter(): null given` fix.
- `references/lazy-import-console-fix.md` — ServerConsole `.terminal` error; direct
  imports vs lazy pattern; asset count diagnostic (19 wrong, 31 correct).
- `scripts/headless-whitescreen-check.js` — headless diagnostic.
- `scripts/migrate-to-lucide.py` — FontAwesome → Lucide migration.
