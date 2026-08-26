# yt-dlp Format Selection Optimization

## Audio extraction speed (ytmp3/ytmp4 API context)

**Problem:** when building a YouTube-to-MP3/audio API, naive format selection downloads unnecessary data and wastes time.

### ⚠️ DEAD PATH (do NOT use on `web` client, 2026+)
```bash
yt-dlp -f 'bestaudio[ext=m4a]/bestaudio/best' -x --audio-format mp3 <url>
```
- On the `web` client this either (a) fails `Requested format is not available`, or (b) falls through to `best` and merges video+audio into a `.mp4`.
- YouTube (2026) no longer serves **audio-only** streams on the `web` client without FULL login cookies (SAPISID/SSID/LOGIN_INFO). Visitor cookies are not enough.

### SLOW (re-encode, works but CPU-bound)
```bash
yt-dlp -f 'best' -x --audio-format mp3 --postprocessor-args '-b:a 192k' <url>
```
Downloads the full video (100-200 MB) then re-encodes audio. **20-30s** on this VPS for a 5-min clip.

### FAST — DEMUX from progressive mp4 (no re-encode)
```bash
yt-dlp --no-playlist --js-runtimes node \
  --extractor-args "youtube:player_client=web" \
  -f '18/best[height<=360]' -x --audio-format best \
  -o 'out.%(ext)s' <url>
```
1. Downloads progressive mp4 format 18 (360p, ~2-5 MB) — has embedded audio.
2. `ffmpeg -x` **demuxes** audio only — extracts, does NOT re-encode.
3. Output is native `.m4a` (aac). Discord/WhatsApp play natively.

**~11s** end-to-end on this VPS vs 20-30s with re-encode. ~2x faster, near-zero CPU.

### Notes
- If the caller DEMANDS `.mp3`, use `-x --audio-format mp3` (re-encode) and accept the CPU cost.
- Use `--js-runtimes node` (or full path) so Botguard JS challenge solver runs; without it you get "n challenge solving failed" warnings and missing formats.
- Format `18` is the universal progressive 360p that always carries audio; `best[height<=360]` widens the fallback.
- For video output (ytmp4): `-f 'bestvideo+bestaudio/best' --merge-output-format mp4`.

### Metadata without download (no-auth, no cookies)
```bash
curl "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEOID&format=json"
# → {"title","author_name","thumbnail_url":"https://i.ytimg.com/vi/VIDEOID/hqdefault.jpg",...}
```
Use for API responses instead of a second yt-dlp call (which fails on visitor-only cookies).

### Validated
- VPS: `/home/saturia/api-saturia-codes/server.js` (2026-08-21)
- Before: `-f best -x --audio-format mp3` → 20-30s
- After: `-f '18/best[height<=360]' -x --audio-format best` (demux) → ~11s, native `.m4a`
