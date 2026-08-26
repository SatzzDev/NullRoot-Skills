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
| `/health` | GET | — | `{ok:true}` |
| `/files/:name` | GET | express.static tmp/ | 10-min expiry, `Content-Disposition: attachment` |

Temp artifacts live in `tmp/` (EXPIRY_MS = 10 min), served under `/files/`. Download URLs in
responses are rewritten to `https://api.saturia.codes/files/…`.

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

## Restart from outside
The agent CANNOT restart the gateway/service from inside its own session (it would kill its process
tree). If a restart is needed, tell the user to run `systemctl --user restart api-saturia-codes`
from a separate shell.
