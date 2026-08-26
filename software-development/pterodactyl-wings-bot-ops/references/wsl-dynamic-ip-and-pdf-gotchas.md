# Reference: WSL dynamic-IP panel breakage + container edit gotchas

Session-specific detail and debugging recipes for this Pterodactyl/WSL host. Pair with the
parent SKILL.md (edit loop, dispatcher gotchas). Condensed from a live session.

## 1. Pterodactyl panel "504 / couldn't establish connection" — DYNAMIC IP root cause
On this host `node.saturia.codes` resolves to the PUBLIC IP and the ISP hands out a **dynamic** IP.
When the public IP changes, the DNS A record goes stale and the panel backend calls a dead IP.

Symptom in browser:
- `Could not establish a connection to the machine running this server. Please try again.`
- `/api/client/servers/<uuid>/files/list` → **504 Gateway Timeout**
- `WebSocket connection to 'wss://node.<domain>:8080/api/servers/<uuid>/ws' failed`

Daemon is NOT down. 3-command diagnosis:
```
getent hosts node.<domain>          # stale public IP the panel will call
curl -s https://ifconfig.me          # host's REAL current public IP
openssl s_client -connect 127.0.0.1:8080     # succeeds (cert valid)
openssl s_client -connect <staleIP>:8080     # times out → confirms DNS-only failure
```
Local TLS handshake to 127.0.0.1:8080 succeeds (cert valid ~1 year); public-IP handshake times out.
Panel backend is what calls `https://node.<domain>:8080/...`, so fixing /etc/hosts on the HOST fixes the
panel even though the browser runs elsewhere (panel backend + daemon share this host).

Fix (verified before→after):
- before: `curl -sk -m5 https://node.<domain>:8080/api/system` → `HTTP 000` (~5s timeout)
- after adding `127.0.0.1 node.<domain>` to /etc/hosts → `HTTP 401` (~0.0x s)
```
sudo bash -c "grep -vxF '127.0.0.1 node.<domain>' /etc/hosts > /tmp/h.clean && echo '127.0.0.1 node.<domain>' >> /tmp/h.clean && cp /tmp/h.clean /etc/hosts"
```
(WSL auto-generates /etc/hosts → entry is lost on full WSL reset. Re-apply then.)
Permanent: add `[network]\ngenerateHosts = false` to /etc/wsl.conf (entry persists), OR DNS A record + router
forward :8080 + DDNS (only if daemon must be reached off-host).

## 2. Container working dir is /home/container, NOT the volume path
`docker exec <uuid> bash -c "..."` starts in `/home/container`, which IS the bind-mount of
`/var/lib/pterodactyl/volumes/<uuid>/`. So `cd /var/lib/pterodactyl/volumes/<uuid>` INSIDE the
container fails ("No such file or directory"). Always `cd /home/container && node ...` for in-container
syntax tests or npm installs. `npm`/`node` exist inside the container (uid 999), not in the host shell
(`sudo bash -c "node ..."` → node not found on host). Use `docker exec <uuid> bash -c "cd /home/container && ..."`.
The `sudo docker exec` form needs the container user — `sudo docker exec ad395f3d-... bash -c ...` works
(pterodactyl user not found is fine; it runs as root in exec).

## 3. Forcing nodemon reload after editing events/lib (not just commands/)
`fs.watchFile` in index.js watches ONLY `index.js`. The `events/*.js` and `lib/*.js` are re-required on
bot (re)start. Editing them does NOT reliably trigger a restart via WSL bind-mount inotify — the log may
show no new restart. To force: `sudo touch /var/lib/pterodactyl/volumes/<uuid>/index.js` → nodemon restarts
the whole process and re-requires events/lib. Verify with `sudo docker logs --since 2m <uuid>` looking for
`[nodemon] restarting due to changes...` + `Connected to WhatsApp!`. Note the bot log timestamp format is
`HH:MM` only, so every restart looks like the same minute — rely on the `[nodemon] restarting` line + absence
of `Handler error`, not the clock.

## 4. pdf-lib + fontkit gotchas (for any .topdf / text-to-PDF feature)
- `pdf-lib` in this container is **1.17.1** (npm@latest resolves here to 1.17.1). `npm install pdf-lib@latest`
  will NOT upgrade it (lockfile or registry ceiling). Don't assume `registerFontkit` is a static method.
- In 1.17.1, `PDFDocument.registerFontkit` is `undefined`. It lives on the **prototype**:
  `const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);` (instance method). Static call throws.
- Subsetting fails: `doc.embedFont(bytes, { subset: true })` → `_this.subset.encodeStream is not a function`
  with the fontkit version installed. Use **full embed** (no subset option): `doc.embedFont(bytes)`.
  Trade-off: full DejaVuSans embed ≈ 400 KB for a few lines (fine for WA's ~100 MB cap; subset would be ~10-20 KB).
- Font path inside container: `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` (DejaVu covers Latin + Indonesian
  diacritics é à ü ç; NOT emoji). Embed it so text isn't tofu boxes.
- Both `pdf-lib` and `fontkit` must be `npm install`ed in the container (`npm install pdf-lib fontkit`).
  Verify with `node -e "const {PDFDocument}=require('pdf-lib'); console.log(typeof PDFDocument.prototype.registerFontkit)"`
  → `function`, and `node -e "require('fontkit'); console.log('ok')"`.
- Word-wrap manually: `font.widthOfTextAtSize(line, size)` against `pageWidth - 2*margin`; add pages when
  `cursorY - lineHeight < margin`. A4 = 595.28 x 841.89 pt.
- Send back: `sock.sendMessage(chat, { document:{url:outFile}, fileName, mimetype:'application/pdf', caption }, {quoted:m})`
  then `fs.unlink(outFile, ()=>{})`.
