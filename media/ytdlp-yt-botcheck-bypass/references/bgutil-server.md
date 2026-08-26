# bgutil-ytdlp-pot-provider — server reference

Provider HTTP server (Brainicism/bgutil-ytdlp-pot-provider, v1.3.1). Runs locally,
generates YouTube PoTokens via LuanRT Botguard interfacing. No external service.

## Endpoints (verified)
- `GET  /ping`            → `{"server_uptime":67.4,"version":"1.3.1"}`
- `POST /get_pot`          body `{"client":"web","videoId":"VIDEOID"}`
                           → `{"contentBinding":"...","poToken":"..."}`
- `POST /invalidate_caches`
- `POST /invalidate_it`
- `GET  /minter_cache`

Note: there is NO `/` or `/generate` route (returns 404 — that just means the
server is up; use `/ping` for health).

## Clients accepted by `client` field
`web`, `web_safari`, `web_embedded`, `web_creator`, `ios`, `android`, `tv`,
`mweb`, etc. For yt-dlp injection use context `web.web_player` or `web.client_player`.

## Canvas / native build gotchas
- `npm ci` may show: `npm warn install-scripts canvas@3.2.1 (install: prebuild-install ...)`.
  If canvas fails at runtime, approve with `npm install-scripts approve canvas` then
  rebuild, or ensure system libs present: `libcairo2 libpango-1.0-0 libjpeg8 libgif-dev`.
- On Ubuntu 24.04 the listed libs were already present and the build worked without
  manual approval.

## Integration into a ytmp3/ytmp4 Node API (pattern used for api.saturia.codes)
1. Start provider: `node build/main.js --port 4416` (keep alive via systemd or nohup).
2. In the API server, before spawning yt-dlp, fetch a token per request:
   ```js
   const tok = await fetchPoToken(videoId);   // see SKILL.md pattern
   const args = ['--no-playlist','--js-runtimes','node',
     '--extractor-args','youtube:player_client=web',
     '--extractor-args',`youtube:po_token=web.web_player+${tok}`,
     '-o', outTemplate, url, ...formatFlags];
   ```
3. Keep cookies.txt as a fallback ONLY (COOKIES_FALLBACK=1) — PoToken is primary.
4. Restart the API service: `systemctl --user restart api-saturia-codes`.

## Verification recipe
POST to /get_pot, capture poToken, run yt-dlp manually; a produced .mp3 = success.
If token is rejected, the server logs an error and yt-dlp falls back to cookies (or fails).
