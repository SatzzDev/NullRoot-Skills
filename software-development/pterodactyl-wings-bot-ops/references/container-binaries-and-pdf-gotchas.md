# Container binaries, PDF, and fuzzy-file gotchas (this Pterodactyl/WSL host)

Condensed, reusable patterns from real incidents. Pair with the parent SKILL.md sections.

## 1. Host binary invisible inside the container
Symptom: `child_process.exec("yt-dlp ...")` → `/bin/sh: 1: yt-dlp: not found`, even though
`yt-dlp` works on the WSL host. Cause: the container has its own isolated filesystem + PATH; host
PATH and host-installed binaries are not mounted in.

Fix that actually persists (verified):
- Install the standalone binary into the **volume mount** `/home/container/` (survives container
  restart; `/usr/local/bin` is read-only in the image layer):
  ```bash
  sudo docker exec <uuid> bash -c "cd /home/container && \
    curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp && \
    chmod +x yt-dlp && ./yt-dlp --version"
  ```
- Then spawn it from the bot with PATH injected (the ONLY reliable injection point — setting
  `process.env.PATH` in `runner.js` did NOT reach the bot process; `/proc/<pid>/environ` stayed default):
  ```js
  exec(code, { env: { ...process.env, PATH: `/home/container:${process.env.PATH || ""}` } }, cb);
  ```
  Or just call `/home/container/yt-dlp` by absolute path.
- `ffmpeg` already at `/usr/bin/ffmpeg` in this image (use it for yt-dlp post-processing).
- For the RCE `$` handler to find `yt-dlp` without typing the path, patch its `exec` call in
  `events/message.upsert.js` the same way.

## 2. pdf-lib 1.17.1 fontkit quirk (text→PDF feature)
Installed version in this container is **1.17.1** (not 1.18+). Differences that bit us:
- `PDFDocument.registerFontkit` is **undefined as a static**; it exists on the **prototype**:
  `doc.registerFontkit(fontkit)` after `await PDFDocument.create()`.
- Subsetting (`embedFont(bytes, { subset: true })`) throws `_this.subset.encodeStream is not a function`
  with the installed fontkit version. Use **full embed** (no `subset` option) — larger file
  (~400KB for a few lines) but valid. DejaVu Sans at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
  covers Latin + Indonesian diacritics (é à ü ç), so text renders, not boxes.
- `npm install pdf-lib@latest` still resolved to 1.17.1 (locked) — don't waste time upgrading.
- Pattern:
  ```js
  const { PDFDocument } = require("pdf-lib");
  const fontkit = require("fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"));
  page.drawText(line, { x, y, size: 12, font });
  ```
- A4 = 595.28 × 841.89 pt. Word-wrap via `font.widthOfTextAtSize(line, size)`.

## 3. Third-party IG scrapers are Cloudflare-blocked from the server
`dlpanda.com/instagram?url=...` and `api.zoraahub.com/fetch.php` both fail when called **from the
container** (server IP / no browser JS): dlpanda returns only the landing-page HTML (no results,
protected by Cloudflare beacon); zoraahub returns `502 Bad Gateway` + `Retry-After: 60` (also
Cloudflare). They may work from a real browser but NOT from `child_process`/axios in the bot.
Do not re-debug these as if the code were wrong — the blocker is server-side bot protection.
Reliable alternatives need either a scraper without Cloudflare, or a logged-in IG `sessionid`.

## 4. Pure-JS fuzzy file search (`.getfile` by partial name)
No `string-similarity` dep available. Embed a self-contained Jaro–Winkler (0..1) and walk the
volume (exclude `node_modules`, `session`, `.npm`, `tmp`, `.git`, `data`). `getfile message-upsert`
→ 97% `message.upsert.js` at top. Reusable function:
```js
function jaro(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 1;
  const lenA = a.length, lenB = b.length;
  const d = Math.floor(Math.max(lenA, lenB) / 2) - 1;
  if (d < 0) return 0;
  let m = 0;
  const aM = new Array(lenA).fill(false), bM = new Array(lenB).fill(false);
  for (let i = 0; i < lenA; i++) {
    const lo = Math.max(0, i - d), hi = Math.min(lenB - 1, i + d);
    for (let j = lo; j <= hi; j++) if (!bM[j] && b[j] === a[i]) { aM[i] = bM[j] = true; m++; break; }
  }
  if (m === 0) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < lenA; i++) if (aM[i]) { while (!bM[k]) k++; if (a[i] !== b[k]) t++; k++; }
  t /= 2;
  const sim = (m / lenA + m / lenB + (m - t) / m) / 3;
  let p = 0; const mp = Math.min(4, Math.min(lenA, lenB));
  for (let i = 0; i < mp; i++) { if (a[i] === b[i]) p++; else break; }
  return sim + p * 0.1 * (1 - sim);
}
```
Score each file as `max(jaro(query, basename), jaro(query, basename without ext))`, keep ≥ 0.4,
sort desc, take top 8. For the button payload, encode the absolute path as base64 and **guard
against path traversal** (`path.resolve(p).startsWith(path.resolve(BOT_ROOT))` + `fs.statSync`
isFile) before reading/sending.
