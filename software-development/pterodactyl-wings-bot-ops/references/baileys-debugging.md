# Baileys Bot Debugging in Pterodactyl Containers

Debugging guide for WhatsApp Baileys bots running in Pterodactyl Wings containers.

## 1. Trace errors from Docker logs

```bash
# Get the latest logs and filter for errors
sudo docker logs <server-uuid> 2>&1 | grep -iE "error|TypeError|Cannot find|not a function|uncaughtException" | tail -10

# Get only recent logs (avoid scrolling through old errors)
sudo docker logs --since 60s <uuid> 2>&1 | grep -iE "error|TypeError" | tail -5

# See full stack traces
sudo docker logs <uuid> 2>&1 | grep -A20 "ERROR_STACK\|PLAY ERROR\|TypeError" | tail -20
```

Key tip: old errors from previous reloads will appear in the log buffer. Always
use `--since` with a timestamp or filter by the latest PID restart line.

## 2. Test module loads inside the container

```bash
# Syntax check (must be .js, not .tmp)
node -c /path/to/file.js

# Load test inside the running container
timeout 15 sudo docker exec <uuid> node -e "
const mod = require('./lib/button');
console.log('Exports:', Object.keys(mod));
console.log('resolveThumbnail:', typeof mod.resolveThumbnail);
" 2>&1

# Test with a live payload
sudo docker cp /home/satzz/_probe.js <uuid>:/home/container/_probe.js
sudo docker exec <uuid> bash -c "cd /home/container && node _probe.js"
sudo docker exec <uuid> bash -c "rm -f /home/container/_probe.js"
```

**Pitfall:** `node -e` inside a running container with an active bot process may
hang (the bot holds the process). Always use `timeout` or run in detached mode.

## 3. Common Baileys errors

### `TypeError: resolveThumbnail is not a function`
- **Cause:** A module exports the function at the bottom but it's not reachable
  when loaded through a require chain, OR the module was accidentally overwritten
  by a different file with different exports.
- **Fix:** Verify `module.exports` at the end of the file matches what's expected.
  Check `sudo grep "module.exports" lib/button.js` and confirm the function name.

### `Invalid media type` / `Cannot read properties of undefined (reading 'toString')`
- **Cause:** Baileys `sendMessage()` doesn't support `{ album: [...] }` key.
  Must send each item individually via `conn.sendMessage` in a loop.
- **Fix:** Replace `conn.sendMessage(m.chat, { album: media })` with:
  ```js
  for (const item of media) {
    if (item.video) {
      await conn.sendMessage(m.chat, { video: { url: item.video.url }, ... }, { quoted: m });
    } else if (item.image) {
      await conn.sendMessage(m.chat, { image: { url: item.image.url }, ... }, { quoted: m });
    }
  }
  ```

### `getBuffer` returning `undefined` or causing `.toString()` errors
- **Cause:** `getBuffer` returns raw `ArrayBuffer` (from axios `responseType: 'arraybuffer'`),
  but Baileys `sendMessage` expects a `Buffer`, URL string, or stream — not an `ArrayBuffer`.
- **Fix:** Use `audio: { url: downloadUrl }` (pass URL directly) instead of
  `audio: await getBuffer(downloadUrl)`. Baileys fetches it internally.

## 4. Verify nodemon auto-restart

```bash
# Touch a file to force reload
sudo touch /var/lib/pterodactyl/volumes/<uuid>/index.js
sleep 10
# Check for restart confirmation
sudo docker logs <uuid> 2>&1 | grep -E "nodemon.*restarting|command.*loaded|CONNECTION ESTABLISHED" | tail -3
```

## 5. Verify npm packages installed in container

```bash
sudo docker exec <uuid> ls /home/container/node_modules/<pkg>/package.json && echo "installed" || echo "not installed"
```

## 6. Module export verification pattern

When a module's exports seem wrong:
```bash
# Check what's actually exported at the end of the file
sudo grep -A10 "module.exports" /path/to/file.js

# Test the actual file loaded by the bot (not the temp copy)
sudo grep "require.*lib/downloader\|require.*lib/button" /var/lib/pterodactyl/volumes/<uuid>/handler.js
```
