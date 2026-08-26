# YouTube / yt-dlp Error Diagnosis (validated 2026-08-20, Azure flagged IP)

## Symptom → root cause → fix

### `ERROR: [youtube] XXXXX: Sign in to confirm you're not a bot.`
- **Cause A:** IP is a datacenter/VPS address flagged by YouTube. Cookies absent or invalid.
- **Cause B:** Cookies present but incomplete (missing HSID/SSID/SAPISID/LOGIN_INFO).
- **Fix:** Inject a *complete* logged-in `cookies.txt`. If that still fails, the IP is hard-flagged → need residential/mobile proxy. PoToken alone does NOT fix this on a flagged IP.

### `ERROR: [youtube] XXXXX: The page needs to be reloaded.`
- **Cause:** Session IS recognized (cookies valid) but YouTube wants a re-sync after the headless/injected session.
- **Fix:** This is GOOD news — cookies work. Reload the page once in the browser (or just retry; yt-dlp sometimes recovers). Do NOT discard the cookies. In the puppeteer refresher, do an explicit `page.reload()` after opening the video.

### `ERROR: [youtube] XXXXX: Requested format is not available.`
- **Cause:** Format selector too strict, e.g. `bestaudio[ext=m4a]` — that stream often doesn't exist for the video.
- **Fix:** Use `-f best` then `-x --audio-format mp3 --postprocessor-args "-b:a 192k"`. Let yt-dlp pick the best combined stream and extract audio. This was the actual fix that turned a failing download into a 45 MB MP3.

### `ERROR: ... HTTP Error 403: Forbidden` (on video data / goooglevideo)
- **Cause:** IP hard-banned even with valid token. Seen when PoToken was applied to a popular video that previously worked without it.
- **Fix:** Residential or mobile proxy required. Nothing cookie/PoToken-side resolves a hard IP ban.

### PoToken provider returns a token but download still fails
- bgutil `POST /get_pot` returns a valid `poToken` (804 chars), yt-dlp accepts the format (no "Invalid format" warning), yet YouTube still says "Sign in to confirm". This means the IP is flagged; PoToken is insufficient. Switch to cookies, or to proxy.

## Quick probe sequence (run these to classify)
```bash
# 1. test popular video, no token, no cookies — if OK, IP not hard-banned
yt-dlp -f best -x --audio-format mp3 -o t.%(ext)s "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
# 2. test target video with cookies
yt-dlp --cookies cookies.txt -f best -x --audio-format mp3 -o t.%(ext)s "<url>"
# 3. if 2 fails with "needs reloaded" → reload trick; if "sign in" → IP flagged → proxy
```

## `Requested format is not available` with `bestaudio[ext=m4a]/bestaudio/best` (2026+)
- **Cause:** On the `web` client, YouTube no longer serves audio-only streams without FULL login cookies. The selector falls through to `best` (video+audio merged into `.mp4`) or errors.
- **Fix (no re-encode):** `-f '18/best[height<=360]' -x --audio-format best` → demux audio from progressive mp4 18, output native `.m4a`. ~2x faster than re-encoding. See `references/format-optimization.md`.

## SYMPTOM: API / bot times out waiting for conversion (not a yt-dlp error string)
- **Cause A — dead PoToken provider:** `bgutil-ytdlp-pot-provider` (port 4416) crashes silently. API falls back to cookies-only; if those are visitor-only (no SAPISID), every request hits "page needs to be reloaded" → retry storm → bot timeout (the conversion blocks the HTTP response until it finishes or hits the 5-min timeout).
  - **Fix:** `curl -sf http://localhost:4416/ping` before serving; if down, restart `node build/main.js` in `/home/saturia/bgutil-ytdlp-pot-provider/server`. Better: a systemd user service with `Restart=always`.
- **Cause B — re-encode too slow:** `-x --audio-format mp3` re-encodes (CPU-bound) and the API holds the request open until done. A 5-min video can take 20-30s, blowing past Discord/WhatsApp bot reply windows.
  - **Fix:** demux-only (above) → ~11s. Or make the API async (return a job_id, let the bot poll) so the reply is instant.
- **Cause C — response shape mismatch:** if the download URL in the response still says `.mp3` but the file is `.m4a`, clients that hard-require the extension break. Keep the URL extension == real file extension (`realExt`, not the endpoint name).
- **Probe:** `time curl "http://localhost:4000/ytmp3?url=..."` — if real > 15s, it's Cause B. If it returns `Conversion failed (all proxies exhausted)` with empty `detail`, the provider is dead (Cause A).

