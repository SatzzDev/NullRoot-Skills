# Worked example: ytmp3 / ytmp4 REST API exposed via Cloudflare Tunnel

Project: `/home/saturia/api-saturia-codes/` (express + yt-dlp), served on `:4000`,
exposed at `https://api.saturia.codes/ytmp3?url=` and `/ytmp4?url=`.
Tunnel `a9521ff9-c74b-422a-a900-6fee7294aa2a` (`config_src: local`) carries
`api.saturia.codes -> localhost:4000` and `agent.satzz.online -> localhost:9119`.

## yt-dlp on a datacenter IP — the 403 fix (the important part)
Plain `yt-dlp` against YouTube from this VPS 403s ("unable to download video data: HTTP Error 403").
Two required flags solve it (verified):
```
--js-runtimes node
--extractor-args "youtube:player_client=web"
```
`--js-runtimes node` lets yt-dlp solve YouTube's JS challenge using the host Node
(`/home/saturia/.hermes/node/bin/node`). Without a JS runtime yt-dlp errors
"Only images are available" / "Requested format is not available".

For audio (`-x --audio-format mp3`) the format selector is `bestaudio[ext=m4a]/bestaudio/best`.
For video, merge `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best` with
`--merge-output-format mp4` and DO NOT pass `-x/--audio-format` (causes "no such option: -b").
Keep `--postprocessor-args "-b:a 192k"` for both — it's valid for the merge/extract step.

## API contract
- `GET /ytmp3?url=<youtube>` -> 200 JSON `{ success, format:"mp3",
  url:"https://api.saturia.codes/files/<id>.mp3", expiresInMs:600000, ... }`
- `GET /ytmp4?url=<youtube>` -> same shape, `format:"mp4"`, `.mp4`.
- Invalid/non-YouTube URL -> 400 `{error:"Invalid YouTube URL"}`.
- Files live in `tmp/` and a `setInterval(cleanup, 60s)` deletes any file whose
  mtime is > 10 min old (in-progress files tracked in an `activeJobs` Set so they
  aren't deleted mid-convert). Served via `express.static('/files', tmp)`.

## systemd user unit gotcha (why it 203/EXEC'd)
`ExecStart=/usr/bin/node ...` FAILED — node is NOT at `/usr/bin/node` on this host.
Fix: use `/home/saturia/.hermes/node/bin/node` AND set an explicit PATH so the
yt-dlp child (which inherits env) can find node for `--js-runtimes node`:
```
Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/saturia/.hermes/node/bin/node /home/saturia/api-saturia-codes/server.js
```

## Install deps that were missing on this host
- `sudo apt-get install -y ffmpeg`  (ffmpeg 6.1.1)
- yt-dlp: no `pip`; grabbed standalone release -> `sudo cp /tmp/yt-dlp /usr/local/bin/yt-dlp && chmod +x`.
