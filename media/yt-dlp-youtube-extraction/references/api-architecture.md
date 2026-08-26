# API architecture: caching + deployment (ytmp3/ytmp4 converter)

Validated on api.saturia.codes (VPS, Express + yt-dlp, 2026-08-21).

## Working VPS config (what actually runs)
- `cookies.txt` = **visitor-only** (no SAPISID/SSID/LOGIN_INFO). Still works because the
  bgutil PoToken provider (port 4416) is alive and supplies `po_token=web.web_player`.
- Format for audio: `-f '18/best[height<=360]' -x --audio-format best` → native `.m4a` (demux, no re-encode).
- Metadata: YouTube oEmbed (`/oembed?url=...&format=json`), NOT a second yt-dlp call.
- PoToken provider MUST be up or the API falls back to cookies-only → "page needs to be reloaded" → bot timeout.

## 1. File cache by video ID (avoid duplicate downloads)
Same URL requested twice should NOT re-download. Key the cache file by the 11-char video ID,
not a random hex per request.

```js
const vm = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
const vid = vm ? vm[1] : crypto.randomBytes(12).toString('hex');
const realExt = format === 'mp3' ? 'm4a' : 'mp4';   // serve native m4a, keep endpoint name
const cachePath = path.join(TMP_DIR, `${vid}.${realExt}`);
const id = vid;                                       // file name == cache key

if (fs.existsSync(cachePath)) {
  const st = fs.statSync(cachePath);
  if (Date.now() - st.mtimeMs <= EXPIRY_MS) {
    // serve from disk — instant (0.1s vs 15s download). reuse mtime for expiry.
    return res.json({ /* ... via: 'cache' ... */ });
  }
  fs.unlink(cachePath, () => {});  // expired: drop so cleanup won't race
}
const finalPath = cachePath;  // yt-dlp writes straight to the cache name
```

Notes:
- `EXPIRY_MS` = 10 min here. Reuse `fs.statSync().mtimeMs + EXPIRY_MS` for `expiresAt` so the
  cleanup interval (which keys off mtime) and the cache TTL stay in sync.
- Output is `.m4a` for the `ytmp3` endpoint — Discord/WhatsApp play aac natively. Only re-encode
  to `.mp3` if the caller hard-requires it (CPU cost).

## 2. In-flight dedupe (concurrent same-URL requests)
If 5 users hit the same URL at once, don't spawn 5 yt-dlp downloads to the same file. Wait on one.

```js
const inFlight = new Map();  // vid -> { resolve }

if (inFlight.has(vid)) {
  console.log(`[${format}] ${id} waiting on in-flight download`);
  return inFlight.get(vid).resolve.then(() => {
    if (fs.existsSync(cachePath)) return res.json({ /* cached result */ });
    res.status(500).json({ error: 'in-flight download lost' });
  });
}
const inFlightPromise = new Promise((resolve) => { inFlight.set(vid, { resolve }); });
// ... after successful download OR after all attempts fail:
if (inFlight.has(vid)) { inFlight.get(vid).resolve(); inFlight.delete(vid); }
```

Resolve (and delete) the in-flight entry on BOTH success and final failure so waiters unblock.

## 3. Deploy as systemd user service (clean restart)
`~/.config/systemd/user/api.saturia-codes.service`:
```ini
[Unit]
Description=api.saturia.codes (yt-dlp ytmp3/ytmp4 converter)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/saturia/api-saturia-codes
Environment=POT_PROVIDER_URL=http://localhost:4416/get_pot
Environment=COOKIES_FALLBACK=0
ExecStartPre=/bin/bash -c 'curl -sf http://localhost:4416/ping >/dev/null 2>&1 || (cd /home/saturia/bgutil-ytdlp-pot-provider/server && node build/main.js >/tmp/pot-provider.log 2>&1 & sleep 3)'
ExecStart=/home/saturia/.hermes/node/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```
Then: `systemctl --user daemon-reload && systemctl --user enable api.saturia-codes.service`.
Restart: `systemctl --user restart api.saturia-codes.service`.

Pitfall: a stale manually-launched `node server.js` (from a background terminal) holds port 4000,
so the systemd start fails with `EADDRINUSE`. Before starting/enabling systemd, `pkill -9 -f 'node server.js'`
and confirm `ss -tlnp | grep 4000` is empty.

## 4. restart.sh (one-shot convenience)
```bash
#!/usr/bin/env bash
set -e
cd /home/saturia/api-saturia-codes
pkill -f 'node server.js' 2>/dev/null || true
sleep 1
if ! curl -sf http://localhost:4416/ping >/dev/null 2>&1; then
  ( cd /home/saturia/bgutil-ytdlp-pot-provider/server && node build/main.js >/tmp/pot-provider.log 2>&1 & )
  sleep 3
fi
POT_PROVIDER_URL=http://localhost:4416/get_pot COOKIES_FALLBACK=0 \
  /home/saturia/.hermes/node/bin/node server.js >/tmp/api-saturia-codes.log 2>&1 &
sleep 2
curl -sf http://localhost:4000/health >/dev/null && echo "[restart] API up" || echo "[restart] FAILED"
```

## PoToken provider as a systemd service
The provider (port 4416) dies silently and its death causes bot timeouts. Give it its own
`Restart=always` systemd user service pointing at `node build/main.js` in
`/home/saturia/bgutil-ytdlp-pot-provider/server`, OR rely on the API's `ExecStartPre` ping-check
above. Either way: never depend on it being up without a health check.
