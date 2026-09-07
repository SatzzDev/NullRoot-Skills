---
name: youtube-download-api
description: Fix yt-dlp ytmp3/ytmp4 bot-challenge via proxy rotation.
---

# YouTube Download API (yt-dlp)

Self-hosted YouTube mp3/mp4 download API (yt-dlp + Node/Express). Used by
this user's WhatsApp bots via `lib/downloader.js`.

## Trigger signals
- API returns 500 with yt-dlp "Sign in to confirm you're not a bot".
- Downloads work intermittently (some videos pass, many fail).
- User mentions ytmp3/ytmp4 endpoint, cookies.txt, or bot-challenge.
- Deciding cookies vs proxy for YouTube access.

## Diagnose the bot-challenge
Error: `[youtube] <id>: Sign in to confirm you're not a bot. Use --cookies...`
Two root causes:
1. **Incomplete cookies** — cookies.txt missing critical auth cookies
   (HSID, SSID, SAPISID, LOGIN_INFO). Check:
   `grep -cE "HSID|SSID|SAPISID|LOGIN_INFO" cookies.txt`
   If any is 0, the export was partial (session not fully logged in, or
   export tool skipped them). Symptom: intermittent failures.
2. **IP / rate-block** — server IP flagged by YouTube.

Confirm with a direct test:
`yt-dlp --cookies cookies.txt -f bestaudio -x --audio-format mp3 -o out.%(ext)s "<url>"`
If it still fails, cookies are bad OR IP is blocked.

Test multiple `player_client` values (web, tv, android, ios, web_safari).
If ALL fail, it's not the client — it's auth/IP. `?si=...` share params in
the URL do NOT cause the challenge (tested) — don't blame URL format.

## Modern yt-dlp Execution Requirements
- **JavaScript Runtime**: Modern yt-dlp requires a JS runtime to solve n-sig and signature challenges. Always pass `--js-runtimes node:/home/saturia/.hermes/node/bin/node` (or `node`/`deno`). Missing JS runtime leads to `Sign in to confirm you're not a bot` or missing stream formats.
- **Deprecated flags**: Do NOT pass `--no-call-home` (deprecated in newer yt-dlp versions).
- **Socket timeouts**: Use `--socket-timeout 25 --retries 3`.
- **Parallel fragment downloading**: Pass `--concurrent-fragments 5 --buffer-size 16M` to saturate available bandwidth for multi-part DASH streams.
- **Direct AAC audio extract (No Re-encoding)**: Use `-f "ba[ext=m4a]/ba/b" -x --audio-format m4a`. Plain `ba/b` often fetches Opus (WebM), forcing FFmpeg into an expensive 10-15s CPU re-encode to m4a. Prioritizing native YouTube AAC stream (itag 140) demuxes in ~0.1s with zero transcode loss.

## Performance & Caching Patterns
- **Concurrent metadata & download**: Run oEmbed metadata (`https://www.youtube.com/oembed`) concurrently with `runYtDlp` via `Promise.all([metaPromise, runPromise])` rather than serial awaits.
- **Prefix disk caching**: Check the temporary directory (`/mnt/api-tmp`) for existing non-expired files matching `${format}_${vid}_` (`Date.now() - st.mtimeMs < EXPIRY_MS`) to return repeat downloads instantly (<100ms) with `cached: true`.
- **In-flight request deduplication**: Track active downloads via a Map key `${format}:${vid}` so duplicate simultaneous requests share the same promise.

## Cookies Proxy decision
- **Cookies**: expire/rotate frequently (YouTube invalidates sessions),
  need re-export, and require ALL critical cookies. High maintenance.
- **Residential / ISP / mobile proxy**: YouTube blocks cheap datacenter
  proxies hard → use **residential or mobile** rotating proxy. A rotating
  gateway (one URL, IP changes per request) is ideal.
- Recommendation for this user: **proxy rotation, cookies as fallback only.**

## Proxy providers (2026, tested/cheap)
- **DataImpulse** — $5 free credit; gateway `gw.dataimpulse.com` port
  823 (HTTP) / 824 (SOCKS5); auto-rotates per request. Best starter.
- **Proxy-Seller** — from $0.75/IP, residential & ISP.
- **IPRoyal / Decodo / Bright Data / Oxylabs** — higher quality, pricier
  (YouTube is bandwidth-heavy → per-GB gets expensive).

## Proxy rotation pattern (Node + yt-dlp)
Read proxy list from env (`PROXIES="socks5://...,http://..."` or single
`PROXY`). On yt-dlp failure, try next proxy; optionally fall back to
cookies when `COOKIES_FALLBACK=1`. Full handler in
`references/server-proxy-rotation.md`.

Key points:
- Pass proxy to yt-dlp via `--proxy <url>` arg.
- Keep `--js-runtimes node` (node must be on PATH) so YouTube JS runs.
- Timeout/kill long jobs (5 min) to avoid hung workers.
- Rotate `--proxy` per attempt, not just per process.
- Put proxy URL (with creds) in a `chmod 600` `.proxy.env` loaded via
  systemd `EnvironmentFile=`, never inline in `ExecStart` (visible in ps).

## This user's instance (api.saturia.codes)
- yt-dlp ytmp3/ytmp4, VPS `saturia`, `server.js` @
  `/home/saturia/api-saturia-codes`, port 4000, Cloudflare-fronted.
- systemd system unit `/etc/systemd/system/api-saturia.service`.
- Temp storage: `/mnt/api-tmp` (separate 16GB ext4 disk partition).
- **Endpoint gotcha**: routes are `/ytmp3?url=` and `/ytmp4?url=`
  (NO `/api/` prefix — that 404s).
- Restart: `sudo systemctl daemon-reload && sudo systemctl restart api-saturia`.
- Validate: `curl "https://api.saturia.codes/ytmp3?url=<youtube_url>"`
  → expect 200 + `{"success":true,...}`.

## Pitfalls
- Single datacenter proxy gets blocked fast — rotate or use residential.
- cookies.txt missing HSID/SSID/SAPISID silently fails some videos.
- Don't hardcode proxy creds in command line; use the env file.
