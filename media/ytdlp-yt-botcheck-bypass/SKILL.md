---
name: ytdlp-yt-botcheck-bypass
description: Bypass YouTube bot-check via local PoToken generator.
---

# Bypass YouTube bot-check for yt-dlp downloads (PoToken)

## When this applies
- `yt-dlp` errors: `ERROR: [youtube] VIDEO: Sign in to confirm you're not a bot.`
- YouTube (2025+) increasingly requires a **PoToken** (Proof-of-Origin Token) even with valid cookies, especially from datacenter IPs (Azure, GCP, AWS).
- User says "pake pot" / "PoToken" / wants to stop rotating cookies daily.

> ⚠️ **SLANG PITFALL — read this first.** In this user's vocabulary, **"pot" = PoToken**, NOT "proxy". Do NOT translate "pot" to proxy. If they say "pake pot drpd cookies" they mean: use Proof-of-Origin Token *instead of* cookies. (I once wasted a whole session building proxy-rotation code because I misread "pot" as "proxy" — don't repeat that.)

## The fix: generate PoToken locally (no paid proxy needed)
Use **bgutil-ytdlp-pot-provider** — a local HTTP server that solves YouTube's Botguard challenge and returns a fresh PoToken per video. No residential proxy, no daily cookie exports.

### Setup (verified on Node v22, Ubuntu 24.04)
```bash
git clone --single-branch --branch 1.3.1 --depth 1 \
  https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git
cd bgutil-ytdlp-pot-provider/server
npm ci
npx tsc            # produces build/main.js
node build/main.js --port 4416 &
```
- Requires Node ≥ 20 (v22 ✓). System libs `libcairo`, `libpango`, `libjpeg` must exist (normally present; `canvas` native build is pulled by npm ci).
- Health check: `curl http://127.0.0.1:4416/ping` → `{"server_uptime":...,"version":"1.3.1"}`
- **Generate token**: `POST /get_pot` with JSON body `{"client":"web","videoId":"VIDEOID"}` → returns `{"poToken":"...","contentBinding":"..."}`
  ```bash
  curl -s -X POST http://127.0.0.1:4416/get_pot \
    -H 'Content-Type: application/json' \
    -d '{"client":"web","videoId":"VECuGvvg7mE"}'
  ```

### Inject into yt-dlp — THE FORMAT IS TRICKY
```
--extractor-args "youtube:po_token=web.web_player+<TOKEN>"
```
- Uses **`+`** between context and token — NOT `:`!
- ❌ Wrong: `web:TOKEN` → `Invalid po_token configuration format. Expected "CLIENT.CONTEXT+PO_TOKEN"`
- ✅ Right: `web.web_player+TOKEN` → format accepted (if token itself is invalid you still get the bot-check error, but the format is correct — that's how you know syntax is right).
- Context strings seen in the wild: `web.web_player`, `web.client_player`.

### Per-request injection (Node server pattern)
Fetch a fresh token, then build yt-dlp args. Don't hardcode a static token — they're per-video.
```js
const http = require('http');
function fetchPoToken(videoId, client = 'web') {
  return new Promise((resolve) => {
    const body = JSON.stringify({ client, videoId });
    const r = http.request({
      hostname: '127.0.0.1', port: 4416, path: '/get_pot', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => { try { resolve(JSON.parse(d).poToken || null); } catch { resolve(null); } });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(30000, () => { r.destroy(); resolve(null); });
    r.write(body); r.end();
  });
}
// args = ['--no-playlist','--js-runtimes','node',
//   '--extractor-args','youtube:player_client=web',
//   '--extractor-args',`youtube:po_token=web.web_player+${token}`,
//   '-o', outTemplate, url]
```

## What does NOT work (avoid wasting time)
- **Free public proxies** (proxifly / proxyscrape lists): tested 10/10 → `Host unreachable` / `HTTP 000` (dead or YouTube-blocked datacenter IPs). Need **residential/mobile** (e.g. DataImpulse `gw.dataimpulse.com:823` HTTP / `:824` SOCKS5, $5 free credit, auto-rotating) if you must go the proxy route.
- **Partial cookies**: a Netscape `cookies.txt` missing HSID / SSID / SAPISID / LOGIN_INFO / __Secure-1PSID still fails even when the file "exists". A full export from a logged-in session is required — and even then it fails from datacenter IPs in 2026 because PoToken is now mandatory for many videos.
- **yt-dlp frozen binary**: `/usr/local/bin/yt-dlp` is a pyinstaller-style standalone binary; you can't easily `pip install` the bgutil *plugin* into it. Calling the provider HTTP server + injecting `--extractor-args` manually (pattern above) is far simpler than fighting plugin install.

## Verify before declaring done
```bash
TOK=$(curl -s -X POST http://127.0.0.1:4416/get_pot -H 'Content-Type: application/json' \
  -d '{"client":"web","videoId":"VECuGvvg7mE"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).poToken)}catch{}})')
yt-dlp --no-playlist --js-runtimes node \
  --extractor-args "youtube:player_client=web" \
  --extractor-args "youtube:po_token=web.web_player+$TOK" \
  -f "bestaudio" -x --audio-format mp3 -o out.%(ext)s \
  "https://www.youtube.com/watch?v=VECuGvvg7mE"
```
Success = an `.mp3` file is produced (not a bot-check error).

## References
- `references/bgutil-server.md` — full provider server endpoints, client options, canvas troubleshooting, and a worked integration into a ytmp3/ytmp4 Node API.
