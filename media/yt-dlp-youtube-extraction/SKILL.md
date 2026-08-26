---
name: yt-dlp-youtube-extraction
description: Fix yt-dlp YouTube bot-checks and PoToken issues.
---

# yt-dlp YouTube Extraction (bot-check / flagged-IP survival)

## When to use
- yt-dlp returns `Sign in to confirm you're not a bot`, `The page needs to be reloaded`, `403 Forbidden`, or `Requested format is not available`.
- You run yt-dlp from a **datacenter/VPS IP** (Azure, AWS, GCP, OVH, etc.) — YouTube flags these and demands more proof of origin.
- You maintain a YouTube-to-MP3/MP4 API or downloader bot.
- User says "pot" / "PoToken" / "cookies" in a YouTube-download context.

## TERMINOLOGY (this user)
- **"pot" = PoToken (Proof-of-Origin Token)**, NOT proxy. Do not confuse. If user says "pake pot drpd cookies", they mean use PoToken instead of/in addition to cookies — not a network proxy.
- User preference (stated): **cookies are the most reliable** for their setup; PoToken is a fallback, not primary. Keep cookies PRIMARY, PoToken as fallback.

## Error → cause → fix (DIAGNOSE BEFORE ACTING)
See `references/error-diagnosis.md` for the full table. Quick version:

| Error | Meaning | Fix |
|-------|---------|-----|
| `Sign in to confirm you're not a bot` | IP flagged / no valid session | Inject valid cookies OR residential proxy |
| `The page needs to be reloaded` | Session recognized but out of sync | Reload the page once in browser; cookies still usable |
| `Requested format is not available` | Format selector too specific (e.g. `bestaudio[ext=m4a]`) | Use `-f best` then `-x --audio-format mp3` |
| `403 Forbidden` on video data | IP hard-banned even with token | Residential/mobile proxy required; PoToken alone won't save a banned IP |

## PROVEN PATH (validated 2026-08-20)
On a flagged Azure IP, the only setup that actually downloaded a blocked video was:
1. **Refreshed cookies** loaded into yt-dlp (`--cookies cookies.txt`).
2. **Format `-f best`** (NOT `bestaudio[ext=m4a]`), then `-x --audio-format mp3`.
3. yt-dlp binary that works (frozen `/usr/local/bin/yt-dlp` 2026.07.04 worked; venv 2026.08.19 + bgutil plugin also worked but added no benefit on a flagged IP).

PoToken via bgutil provider ALONE did NOT bypass the flag. Cookies (refreshed) did.

## How to refresh cookies (the key trick)
You already have a logged-in `cookies.txt`. Instead of manually re-exporting, **open YouTube in headless Chromium with the existing cookies injected, let the session re-sync, then pull fresh cookies**. Script: `scripts/refresh-youtube-cookies.js`.

Steps to set up the refresher (one-time):
- Install Chromium + deps (Ubuntu 24.04: `chromium` snap, `libnss3 libatk1.0-0 libgbm1 libx11-6 libxcomposite1 libxdamage1 libxrandr2 libgtk-3-0 libasound2t64 libpangocairo-1.0-0 libcairo2 libxshmfence1`).
- `npm i puppeteer-core`, point `executablePath` of Chromium at the installed binary, launch with `--no-sandbox`.
- Inject old cookies via CDP `Network.setCookies`, open YT home + a video, **reload once**, wait ~10s, read `Network.getAllCookies` + `page.cookies()`, merge with old critical cookies (HSID etc. are HttpOnly and may not come back from CDP — keep them from the old set), write Netscape format.
- Run on a systemd timer (every 12h) so cookies stay alive as long as the YouTube account session is valid.

## PoToken provider (bgutil) — setup reference
When you DO want PoToken (fallback or for non-flagged IPs), see `references/bgutil-setup.md`. Key gotchas:
- yt-dlp needs a JS runtime for Botguard: pass `--js-runtimes node:/path/to/node` (the frozen binary's node may not be on PATH for a venv yt-dlp).
- Provider runs an HTTP server on port 4416, route `POST /get_pot` with `{"client":"web","videoId":"ID"}`.
- Plugin install requires a real yt-dlp module (pip/venv), NOT the frozen binary — the frozen binary won't load plugins.
- PoToken does NOT guarantee bypass on a flagged IP. Don't waste time on it alone.

## Speed optimization for audio extraction
For ytmp3/ytmp4 API or bulk audio downloads, format selection dramatically affects speed. See `references/format-optimization.md` for the full breakdown.

**⚠️ CORRECTED (2026-08-21, validated on VPS ytmp3 API):** The old "quick win" `-f 'bestaudio[ext=m4a]/bestaudio/best'` is now WRONG for the `web` client. YouTube (2026) does NOT offer audio-only streams on the `web` client without FULL login cookies (SAPISID/SSID/LOGIN_INFO). That selector either (a) fails with `Requested format is not available`, or (b) falls through to `best` and merges video+audio into a `.mp4` — not audio-only.

**Real no-re-encode speed win — DEMUX from progressive mp4:**
```bash
yt-dlp --no-playlist --js-runtimes node \
  --extractor-args "youtube:player_client=web" \
  -f '18/best[height<=360]' -x --audio-format best \
  -o 'out.%(ext)s' URL
```
- Downloads progressive mp4 (format 18 = 360p, ~2-5 MB) then **demuxes audio only** — ffmpeg extracts, does NOT re-encode. ~2x faster than `-f best -x --audio-format mp3` (which re-encodes).
- Output is native `.m4a` (aac) — Discord/WhatsApp play it natively. No MP3 needed unless caller demands it.
- On this VPS: ~11s end-to-end vs 20-30s with re-encode.
- If you MUST produce `.mp3` (re-encode), keep `-x --audio-format mp3 --postprocessor-args '-b:a 192k'` but expect the CPU cost.

**Metadata without downloading (no-auth):** YouTube oEmbed returns title/author/thumbnail with zero cookies or PoToken:
```bash
curl "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEOID&format=json"
# → {"title":..., "author_name":..., "thumbnail_url":"https://i.ytimg.com/vi/VIDEOID/hqdefault.jpg", ...}
```
Use this for API responses instead of a second yt-dlp `--dump-json` call (which fails on visitor-only cookies). Validate `https://i.ytimg.com/vi/<id>/hqdefault.jpg` is the thumbnail.

**PoToken provider uptime pitfall:** `bgutil-ytdlp-pot-provider` (port 4416) dies silently. Wrap it in a systemd user service with `Restart=always`, or check `curl -sf http://localhost:4416/ping` before each API request and restart it. A dead provider makes the API fall back to cookies-only → "page needs to be reloaded" → bot timeout.

## Pitfalls
- **Format selection context matters:** For bot-check/auth troubleshooting use `-f best`; for speed use the demux trick `-f '18/best[height<=360]' -x --audio-format best` (see above). The old `bestaudio[ext=m4a]/bestaudio/best` chain is NOT robust on the 2026 `web` client — it merges video into a `.mp4` or errors. Do not recommend it.
- Free public proxies (proxifly, proxyscrape) are DEAD for YouTube (10/10 `Host unreachable`). Don't burn time on them.
- A "page needs to be reloaded" error means cookies ARE working — just reload, don't throw them away.
- The PoToken provider (port 4416) dies silently — health-check it (or systemd `Restart=always`) before relying on it; a dead provider causes bot timeouts, not a clean error.
