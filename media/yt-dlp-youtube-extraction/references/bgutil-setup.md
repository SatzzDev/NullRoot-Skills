# bgutil PoToken provider setup (reference, NOT the primary fix on flagged IPs)

Source: https://github.com/Brainicism/bgutil-ytdlp-pot-provider
Used as a *fallback*; cookies are primary per owner preference.

## Provider (HTTP server, port 4416)
```
git clone --single-branch --branch 1.3.1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git
cd bgutil-ytdlp-pot-provider/server
npm ci
npx tsc
node build/main.js --port 4416
```
Health: `GET /ping` → `{"server_uptime":...,"version":"1.3.1"}`
Generate: `POST /get_pot` with body `{"client":"web","videoId":"VIDEOID"}` → `{"poToken":"...","contentBinding":"..."}`

## yt-dlp integration
- Frozen binary (e.g. `/usr/local/bin/yt-dlp`) CANNOT load the plugin. You need a real module:
  `python3 -m venv ytvenv && source ytvenv/bin/activate && pip install "yt-dlp>=2025.5.22" bgutil-ytdlp-pot-provider`
- yt-dlp needs a JS runtime for Botguard: `--js-runtimes node:/path/to/node` (the venv's yt-dlp won't find node on PATH otherwise).
- Point plugin at provider: `--extractor-args "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"`

## Gotchas
- `CAUTION` from README: PoToken does NOT guarantee bypass of 403/bot-check — only makes traffic look more legitimate. On a flagged datacenter IP it is insufficient.
- `po_token` arg format is `CLIENT.CONTEXT+TOKEN` (e.g. `web.web_player+XXXX`), NOT `web:XXXX`.
- `canvas` npm install script may be blocked by npm `allowScripts`; provider still runs for token generation without it in many cases, but build (`npx tsc`) is required.

## When to actually use this
Only when the IP is NOT hard-flagged (popular videos download fine without cookies). On a flagged Azure IP, skip straight to refreshed cookies.
