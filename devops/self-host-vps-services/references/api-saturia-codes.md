# api.saturia.codes — service reference

Self-hosted multi-endpoint API on the saturia VPS. Lives at `/home/saturia/api-saturia-codes`,
served on port **4000** behind the CF Tunnel (`api.saturia.codes`). Node-only — no framework magic
beyond Express + native `fetch` (Node 22). systemd **user** unit:
`/home/saturia/.config/systemd/user/api-saturia-codes.service`. Restart with
`systemctl --user restart api-saturia-codes` (NOT restart.sh — that pkill's and races).

## Endpoints
| Route | Method | Backend | Notes |
|---|---|---|---|
| `/ytmp3` `/ytmp4` | GET | yt-dlp + cookies | audio is native .m4a (no re-encode) |
| `/tiktok/trending` | GET | TikWM `/api/feed/list` | region (2-letter, default ID), count 1-30, cursor |
| `/tiktok/download` | GET | TikWM `/api/` | `?url=` TikTok URL -> no-wm/hd/wm/music/cover absolute URLs |
| `/ai/chat` | POST | 9Router `ROUTER_URL` (default `http://127.0.0.1:20128/v1/chat/completions`) | OpenAI-compatible; collapses 9Router's always-SSE into one JSON when `stream:false` |
| `/tts` | GET | edge-tts | `?text=` (max 5000), `?voice=` default `id-ID-GadisNeural` -> temp .mp3 |
| `/yt/search` | GET | `yt-search` npm | `?q=`, `?max=` 1-50 -> id/title/url/thumbnail/author/duration/views |
| `/screenshot` | GET | `chromium-browser --headless=new` | `?url=`, `?full=1`, `?w=&?h=` -> temp .png |
| `/upscale` | POST | imglarger photoai | multipart/form-data, field `image` + optional `scale` (2 or 4, default 4) -> `{success, scale, filename, size_bytes, result_url}` |
| `/health` | GET | — | `{ok:true}` |
| `/api-docs` | GET | swagger-ui-express | OpenAPI 3.0 docs, dark-themed to match landing page |
| `/files/:name` | GET | express.static tmp/ | 10-min expiry, `Content-Disposition: attachment` |

Temp artifacts live in `tmp/` (EXPIRY_MS = 10 min), served under `/files/`. Download URLs in
responses are rewritten to `https://api.saturia.codes/files/…`.

## Swagger / API Docs (`/api-docs`)
Added Aug 2026. Dependencies: `swagger-ui-express`, `yamljs`.

- **Spec file**: `docs/swagger.yaml` (OpenAPI 3.0, minimal — covers all endpoints)
- **Theme**: dark mode CSS injected via `customCss` in `swaggerUi.setup()`, matching the landing
  page design system:
  - bg `#0d0d11`, ink `#f4f4f6`, primary red `#ff0033` / `#ff4d6d`
  - fonts: `Inter` body, `Space Grotesk` headings, `JetBrains Mono` code
  - GET badges: red `#ff0033`, POST badges: blue `#5865f2`
  - inputs: dark `#14141a`, red focus glow, `border-radius: 8-10px`
  - topbar hidden, wrapper max-width 880px
- **Basic auth**: protected by `SWAGGER_USER` / `SWAGGER_PASS` env vars (default `admin` / `s3cr3t`).
  Set `SWAGGER_DISABLE_AUTH=1` to open.

### ⚠️ Auth middleware ordering bug (current code)
The current `server.js` registers basic auth AFTER `swaggerUi.serve` + `swaggerUi.setup` on the
same `/api-docs` path. Express processes `app.use` in registration order, and `swaggerUi.serve`
already sends the full HTML response — the auth middleware never runs. **The docs are currently
unauthenticated despite the auth code existing.**

**Fix**: move auth before serve:
```javascript
// ✅ correct order
app.use('/api-docs', authMiddleware, swaggerUi.serve, swaggerUi.setup(doc, opts));

// ❌ current (broken) — auth registered after serve, never reached
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(doc, opts));
app.use('/api-docs', authMiddleware);
```

### Theming approach
The full CSS is a `const swaggerCss` string in `server.js`, injected via the `customCss` option.
To match a site's design system: extract CSS custom properties (colors, fonts, border-radius) from
the landing page, then override these swagger-ui selectors:
- `.swagger-ui` — base font-family, color
- `.swagger-ui .topbar` — hide or restyle
- `.swagger-ui .opblock`, `.opblock-summary-method` — endpoint cards
- `.swagger-ui .btn.execute` — action buttons
- `.swagger-ui input, textarea, select` — form inputs
- `.swagger-ui .highlight-code, .microlight` — code blocks

Google Fonts are loaded via `@import url(...)` at the top of the CSS string.

## Durable pitfalls / fixes
### edge-tts binary not in systemd PATH (was ENOENT crash-loop)
`edge-tts` only exists inside the hermes-agent venv:
`/home/saturia/.hermes/hermes-agent/venv/bin/edge-tts`. systemd user services don't inherit the
user shell PATH, so `spawn('edge-tts')` failed with `ENOENT` and killed the whole API.
**Fix (already applied):** wrapper at `~/.local/bin/edge-tts`:
```bash
#!/bin/bash
exec /home/saturia/.hermes/hermes-agent/venv/bin/python3 -m edge_tts "$@"
```
plus `Environment=PATH=…/.local/bin:…` and `Environment=ROUTER_URL=…` in the unit. Same class of
bug will hit any CLI that lives only in a venv — wrap it or use an absolute path in spawn.

### POST body needs express.json()
`/ai/chat` returned `model and messages required` until `app.use(express.json({limit:'1mb'}))`
was added. Any future POST endpoint must add this (or read raw body).

### 9Router always streams SSE
`/ai/chat` passes `stream:false` but 9Router ignores it. The route detects
`content-type: text/event-stream` and assembles the last `data:` line into one JSON object.
Keep this collapse logic — callers expect JSON, not an SSE firehose.

### Frontend must track endpoint changes
The landing (`public/index.html`) and docs (`public/docs.html`) are hand-maintained. **Any new
endpoint MUST get a card on the landing + a section + TOC entry + example in docs.** Skipping this
is the usual "API works but docs are wrong" trap. Both pages got `overflow-x:hidden` on `body` to
kill a horizontal-scroll bug from wide code blocks.

### ⚠️ systemd unit must be system-level (Aug 2026 session)
api-saturia.service lives at `/etc/systemd/system/api-saturia.service` (NOT `/home/saturia/.config/systemd/user/`). A user-level unit won't be manageable via `sudo systemctl` and won't survive reconfig. The unit must use `User=saturia` + absolute node binary path.

### ⚠️ Port bind race on restart (Aug 2026 session)
If `RestartSec` is too short (<10s), systemd starts the new process before the old one fully releases port 4000 → `EADDRINUSE` crash loop. Use `RestartSec=10`, `KillMode=mixed`, `TimeoutStopSec=10` to ensure clean shutdown.

### ⚠️ Stale orphan process detection (Aug 2026 session)
If `systemctl status api-saturia` says `inactive (dead)` but `curl localhost:4000` returns 200, an orphan process from a crashed systemd start is running outside systemd management. Kill it (`pkill -9 -f 'node server.js'`), then `systemctl start api-saturia` — the systemd unit will claim the port cleanly.

### ⚠️ Redis dependency (Aug 2026 session)
API crashes on start if Redis is not running (`ECONNREFUSED` to `127.0.0.1:6379`). systemd unit MUST have `After=redis-server.service` and `Wants=redis-server.service`. Verify Redis: `systemctl is-active redis-server`.

### ⚠️ Azure floating IP not bindable by Docker (Aug 2026 session)
The VPS public IP (`5.62.139.35`) is an Azure floating/NAT IP — it does NOT exist on any local interface (`ip addr show` shows only `172.x` private + `127.0.0.1`). Docker CANNOT `bind` to this IP → `failed to bind host port: cannot assign requested address`. **Fix**: set allocation IP to `0.0.0.0` (bind all interfaces) in the Pelican Panel DB (`UPDATE allocations SET ip='0.0.0.0' WHERE id=N`). Never set Docker allocation to a public IP that isn't local to the interface.

### ⚠️ edge-tts Python package dependency (Aug 2026 session)
`edge-tts` is a Node CLI wrapper around a Python package. The `~/.local/bin/edge-tts` script calls `/home/saturia/.hermes/hermes-agent/venv/bin/python3 -m edge_tts`. **If the `edge-tts` Python package is not installed in the hermes-agent venv, the `/tts` endpoint returns `{"error":"...No module named edge_tts"}`** — even if the binary exists and is executable.

**Fix**:
```bash
/home/saturia/.hermes/hermes-agent/venv/bin/pip install edge-tts
```
Verify: `/home/saturia/.hermes/hermes-agent/venv/bin/python3 -m edge_tts --list-voices` should print voice list.

**Pattern**: Any CLI that wraps a Python package via `python -m <pkg>` requires the package installed in the **specific venv** that the wrapper calls. Check with `python3 -c "import <pkg>"` or `--list-voices` before debugging the route.

### ⚠️ API endpoint method and docs consistency
`/tts` uses **GET** with query params (`?text=...&?voice=...`), NOT POST. The `/endpoints` catalog and `public/docs.html` must register it as `method: 'get'`. If registered as POST, the docs UI renders a textarea body editor instead of query param inputs, and the request fails with `Cannot POST /tts`.

**Check**: after adding any new endpoint, verify the `/endpoints` JSON catalog has the correct `method` field (`"get"` or `"post"`), and that `public/docs.html` renders the correct input type.

**Pattern**: "Cannot POST /tts" when the docs UI shows a POST form means the endpoint catalog registered it as POST but the actual route is GET. Fix the `/endpoints` catalog entry in `server.js`, not the route handler.

### ⚠️ Temp dir permission (Aug 2026 session)
server.js tries to create `/mnt/api-tmp` on startup. If `/mnt` is root-owned, mkdir fails with `EACCES: permission denied`. Fix once: `sudo mkdir -p /mnt/api-tmp && sudo chown saturia:saturia /mnt/api-tmp`.

## Restart from outside
The agent CANNOT restart the gateway/service from inside its own session (it would kill its process tree). If a restart is needed, tell the user to run `systemctl --user restart api-saturia-codes` from a separate shell.

### ⚠️ restart.sh pkill race (Aug 2026 session)
`restart.sh` uses `pkill -f 'node server.js'` (SIGTERM). Node processes sometimes don't die on SIGTERM (especially with child processes or I/O pending), leaving the old server on port 4000. The next `node server.js` in the script then hits `EADDRINUSE` and crashes, but the OLD server stays alive — **without any new routes added since it started**.

**Symptom**: new endpoints (e.g. `/upscale`) return `Cannot GET /upscale` or old behavior, even though the code is correct. The frontend is hitting a stale process.

**Fix**: use `pkill -9 -f 'node server.js'` (SIGKILL) + verify port free before starting:
```bash
pkill -9 -f 'node server.js' 2>/dev/null || true
sleep 1
lsof -i :4000 >/dev/null && { echo "port still occupied"; exit 1; }
# then start server
```
Updated in `restart.sh` after this bug bit us.

**Pattern**: "Cannot GET" on a route that DEFINITELY exists in the running code is almost always a stale process, not a missing route. Kill all instances and restart from scratch before debugging the route definition.

## Docs UI (`public/docs.html`)
Hand-built static API documentation page served by Express. Key architecture:
- **Source of truth**: `/endpoints` API route returns JSON catalog → JS renders endpoint cards dynamically
- **Syntax highlighting**: highlight.js (CDN) + `atom-one-dark` theme, auto-detect JSON/JS/HTML/text
- **Copy button**: `navigator.clipboard.writeText()` with `execCommand('copy')` fallback, feedback "copied" 2s
- **Language badge**: colored badge (`JSON`, `JAVASCRIPT`, `HTML`, `TEXT`) rendered next to status code in response header
- **Custom scrollbar**: 5px thin, theme-colored (crimson/gold), applied globally and specifically on `.response-body`
- **Theme-aware**: respects `html.dark` class toggle, CSS custom properties for all colors
- **Hot-reload**: edits to `docs.html` take effect immediately (no build step — static file served by Express)
- **Status bar structure**: `<div class="response-status">` contains status code span + time span + copy button + language badge

### Adding a new endpoint to docs
1. Add route to `server.js` with `/endpoints` catalog entry (method, path, description, params array)
2. The dynamic catalog auto-renders params tables + try-it sections from the `/endpoints` JSON
3. Params array format: `[{name, type, description, required, default}]`
4. POST endpoints with `type: 'file'` params render file input; others render textarea with JSON default body

### Docs.html maintenance pitfalls
- **Empty `.response-status` div in template**: The HTML template includes `<div class="response-status"><span id="rcode-{i}"></span><span id="rtime-{i}"></span></div>` as a placeholder. JavaScript creates a NEW statusBar div and appends it — must remove the old one first (`respBox.querySelector('.response-status').remove()`) before appending the new one, or there will be two status bars.
- **`respBox.appendChild(statusBar)` must be called AFTER the try/catch block**, not inside it, so the status bar shows even on error
- **Copy button must be appended to statusBar before statusBar is appended to respBox** — order matters for DOM structure
- **`codeEl`/`timeEl` are spans INSIDE the template's `.response-status` div** — when building the new status bar, querySelector('.response-status') finds the OLD one. Remove it before appending the new statusBar.

## Testing
`/home/saturia/.hermes/node/bin/node --test test/tiktok.test.js test/tiktok-download.test.js`
(10 tests, pure helpers — TikWM call is faked). Run after any change to `tiktok.js`.

## Dependencies (newly added)
- `axios` + `form-data` — used by `upscale.js` for imglarger photoai API calls
- `multer` — multipart/form-data parsing for `/upscale` file upload
- `highlight.js` (CDN) — syntax highlighting in public/docs.html (loaded via CDN script tag, not npm)

### Docs.html dependency notes
- `highlight.js` is loaded from CDN (`cdnjs.cloudflare.com`), not npm. If the CDN is unavailable, syntax highlighting degrades gracefully to plain text.
- No build step needed for docs.html changes — Express serves it as a static file directly.
- `public/docs.html.bak` exists as a backup of the pre-enhancement version.

### imglarger pitfall
imglarger rejects tiny or invalid images with a cryptic `"Cannot destructure property 'code' of 'upload.data.data' as it is null"`. When testing `/upscale`, use a real image (>= 100x100). The `upscale.js` module uses `while` loop (not `for`) for status polling per user preference.

### User style preference: while > for for polling
For unbounded polling loops with break-on-success, use `while` not `for`. The `for` loop implies a known iteration count; `while` reads cleaner when the loop exits on a condition. Applied in `upscale.js` and should be followed for future polling code in this project.

## Restart from outside
The agent CANNOT restart the gateway/service from inside its own session (it would kill its process
tree). If a restart is needed, tell the user to run `systemctl --user restart api-saturia-codes`
from a separate shell.

### ⚠️ restart.sh pkill race (Aug 2026 session)
`restart.sh` uses `pkill -f 'node server.js'` (SIGTERM). Node processes sometimes don't die on
SIGTERM (especially with child processes or I/O pending), leaving the old server on port 4000.
The next `node server.js` in the script then hits `EADDRINUSE` and crashes, but the OLD server
stays alive — **without any new routes added since it started**.

**Symptom**: new endpoints (e.g. `/upscale`) return `Cannot GET /upscale` or old behavior, even
though the code is correct. The frontend is hitting a stale process.

**Fix**: use `pkill -9 -f 'node server.js'` (SIGKILL) + verify port free before starting:
```bash
pkill -9 -f 'node server.js' 2>/dev/null || true
sleep 1
lsof -i :4000 >/dev/null && { echo "port still occupied"; exit 1; }
# then start server
```
Updated in `restart.sh` after this bug bit us.

**Pattern**: "Cannot GET" on a route that DEFINITELY exists in the running code is almost always a
stale process, not a missing route. Kill all instances and restart from scratch before debugging
the route definition.
