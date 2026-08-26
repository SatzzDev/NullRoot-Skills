# Auto-download (Instagram/TikTok/YouTube) using selfbot scrapers

This session updated the Shiroko bot's Instagram, TikTok, and YouTube auto-download
to use the same scrapers as the Saturia selfbot (`lib/downloader.js`).

## Scrapers (from selfbot `lib/downloader.js`)

Import in handler.js or events/autodownload.js:
```js
const { ttsave, instagram } = require("./lib/downloader");
```

### Instagram — `instagram(url)`
- Uses `https://api.downloadgram.org/media` (POST with URL-encoded body)
- Response: HTML with regex-extracted download links
- Returns array: `[{ video: { url } }]` or `[{ image: { url } }]`

### TikTok — `ttsave(url)`
- Uses `https://tikwm.com/api/` (POST with URL-encoded body)
- Response JSON: `{ author, status, data: { type: "video"|"slide", title, video: { play_url, watermark_play_url }, images[], music_url } }`
- For slides: `data.images` is an array of image URLs
- For videos: `data.video.play_url` is the download URL

### YouTube — `ytmp3(url)` via yt-dlp (in downloader.js, not used by Shiroko)
- Uses local `yt-dlp` binary at `/home/container/yt-dlp`
- **NOT used by Shiroko** — Shiroko uses `api.nasirxml.dev` instead

## YouTube download via api.nasirxml.dev (play.js & ytmp3.js)

```js
const encoded = encodeURIComponent(url);
const res = await fetch(`https://api.nasirxml.dev/download/ytmp3?url=${encoded}`, {
  headers: { accept: "application/json" },
  method: "GET",
  signal: AbortSignal.timeout(45000),
});
const data = await res.json();
// data = { title, format: "mp3", quality: "128", downloadUrl: "https://..." }
```

Response shape: `{ title, format, quality, downloadUrl }`.

## play.js workflow (Shiroko bot)

1. User types `.play <song name>`
2. `yt-search` searches YouTube (need `yt-search@^2.13.1` — `@^2.24.0` does NOT exist)
3. Auto-pick `videos[0]` — **do NOT send a pick list, directly download** (user preference: "jangan kirim lagi pick res.videos[0] dan langsung kirim audio")
4. Send search status message, call `api.nasirxml.dev/download/ytmp3?url=...`, send audio
5. Send follow-up `ButtonV2` card with thumbnail + quick-reply buttons

### Key pitfall: `audio: { url }` vs `getBuffer`
Baileys `getStream` expects a URL string, Buffer, or stream. Using `getBuffer(url)` returns
a raw `ArrayBuffer` which causes `TypeError: Cannot read properties of undefined (reading 'toString')`
at `messages-media.js:259`. Always use `audio: { url: downloadUrl }`.

## handler.js inline auto-download

The handler.js has inline TikTok/Instagram detection (lines ~360-400). Both the inline
handler AND `events/autodownload.js` can fire. Make sure both use the same scraper
functions (`ttsave`, `instagram` from `lib/downloader.js`).

Remove old import after switching:
```js
// DELETE this after switching to lib/downloader.js:
const { tiktok, instagram } = require('notmebotz-tools');
```

## Instagram auto-download: downloadgram → zoraahub fallback

The `instagram()` function (downloadgram.org) may return an empty array for some URLs.
Always have a fallback to `instaDL()` (zoraahub API):

```js
const { instagram, instaDL } = require("./lib/downloader");
let instaRes = await instagram(url);
if (!instaRes || !instaRes.length) {
  console.log("[IG] downloadgram empty, trying instaDL (zoraahub) fallback...");
  instaRes = await instaDL(url);
}
if (instaRes && instaRes.length > 0) {
  // Send each item individually — Baileys does NOT support { album: [...] }
  for (const item of instaRes) {
    if (item.video) {
      await conn.sendMessage(m.chat, { video: { url: item.video.url }, mimetype: "video/mp4", caption: "" }, { quoted: m });
    } else if (item.image) {
      await conn.sendMessage(m.chat, { image: { url: item.image.url }, caption: "" }, { quoted: m });
    }
  }
}
```

**Critical pitfall:** Do NOT use `conn.sendMessage(m.chat, { album: media })`.
Baileys throws `Invalid media type` (HTTP 400) — the `album` key is not a valid
message type. Always loop and send each item individually.

## TikTok auto-download: optional music URL

The `ttsave()` function returns `music_url`, but the TikTok CDN
(`tikwm.com/video/music/...`) may fail with timeout (403/404). Always wrap
the audio send in try-catch so the video still sends:

```js
if (ttRes.data.music_url) {
  try {
    await conn.sendMessage(m.chat, { audio: { url: ttRes.data.music_url }, mimetype: "audio/mpeg" }, { quoted: m });
  } catch (audioErr) {
    console.error("TikTok music fetch failed:", audioErr.message);
    // Video was already sent — music is optional
  }
}
```

Also: the TikTok `slide` type (image carousel) must also be sent individually,
not via `album` key:
```js
for (const img of ttRes.data.images) {
  await conn.sendMessage(m.chat, { image: { url: img }, caption: ttRes.data.title || "" }, { quoted: m });
}
```

## package.json dependency

Add `yt-search` to Shiroko's dependencies:
```json
"yt-search": "^2.13.1"
```
Install inside container: `npm install yt-search@^2.13.1 --save`
Verify: `node -e "require('yt-search')"` inside the container.

## yt-search response shape (v2.13.1)

```js
const r = await ytSearch("query");
r.videos[0] = {
  videoId: "YXZH-eBtmqQ",
  url: "https://youtube.com/watch?v=YXZH-eBtmqQ",
  title: "TEST",
  thumbnail: "https://i.ytimg.com/vi/.../hqdefault.jpg",
  timestamp: "2:04",
  author: { name: "Stray Kids", url: "https://youtube.com/channel/..." }
}
```
Note: `author` is an OBJECT `{ name, url }`, not a string.

## Testing the scraper pipeline

```bash
# Test yt-search inside container:
sudo docker exec <uuid> node -e "
const yt = require('yt-search');
(async () => {
  const r = await yt('test');
  console.log('Title:', r.videos[0].title, '| URL:', r.videos[0].url);
})();
"

# Test nasirxml API:
curl -s 'https://api.nasirxml.dev/download/ytmp3?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ' | jq
# → { title, format: "mp3", quality: "128", downloadUrl: "https://..." }
```

## Monitoring

Set up a cron job (every 5 min) to check `docker logs` for errors:
```bash
CRON_SCHEDULE="*/5 * * * *"
SCRIPT="shiroko_monitor.sh"
# Checks docker logs for: TypeError, ReferenceError, uncaughtException, ERR_, not a function
# Delivery: origin + telegram (notified in chat)
```