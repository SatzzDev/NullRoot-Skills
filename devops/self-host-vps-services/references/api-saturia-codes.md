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

## Testing
`/home/saturia/.hermes/node/bin/node --test test/tiktok.test.js test/tiktok-download.test.js`
(10 tests, pure helpers — TikWM call is faked). Run after any change to `tiktok.js`.

## Dependencies (newly added)
- `axios` + `form-data` — used by `upscale.js` for imglarger photoai API calls
- `multer` — multipart/form-data parsing for `/upscale` file upload

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
