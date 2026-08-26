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

## Cookies vs Proxy decision
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
- systemd user unit `api-saturia-codes.service`.
- **Endpoint gotcha**: routes are `/ytmp3?url=` and `/ytmp4?url=`
  (NO `/api/` prefix — that 404s).
- Restart: `systemctl --user restart api-saturia-codes`.
- Validate: `curl "https://api.saturia.codes/ytmp3?url=<youtube_url>"`
  → expect 200 + `{"success":true,...}`.

## Pitfalls
- Single datacenter proxy gets blocked fast — rotate or use residential.
- cookies.txt missing HSID/SSID/SAPISID silently fails some videos.
- Don't hardcode proxy creds in command line; use the env file.
