---
name: jmusicbot-yt-fix
description: Fix JMusicBot YouTube Lavalink yts.version errors.
---

# JMusicBot YouTube Lavalink Fix

## Symptom

Bot logs show:
```
dev.lavalink.youtube.AllClientsFailedException: (yts.version: 1.18.1) All clients failed to load the item.
Client [TVHTML5] failed: The page needs to be reloaded.
Client [TVHTML5_SIMPLY] failed: Sign in to confirm you're not a bot
```

## Root Cause

JMusicBot bundles an old Lavalink YouTube plugin (v1.18.1) that YouTube permanently blocks. The TVHTML5 and TVHTML5_SIMPLY client types are deprecated/blocked. JMusicBot 0.4.3 release notes explicitly state this release will not resolve the Sign in to confirm you are not a bot issue.

Setting useOAuth = true does NOT fix this -- the error is at the Lavalink library level, not the OAuth token level.

## Fix: Patch Lavalink YouTube plugin inside JMusicBot.jar

### Step 1: Download artifacts

**IMPORTANT**: Use the fork JAR already in the container as the source — it contains custom OAuth and config v2 support (vendor `com.arifbanai`, version 0.7.0). Do NOT overwrite with the official 0.4.3 JAR.

```bash
# Download only the youtube-source plugin (the JAR is already in the container)
curl -sL "https://github.com/lavalink-devs/youtube-source/releases/download/1.18.2/youtube-plugin-1.18.2.jar" -o youtube-plugin-1.18.2.jar
```

If you must download a fresh JMusicBot JAR, get the fork:
```bash
curl -sL "https://github.com/arifbanai/JMusicBot/releases/download/0.7.0/JMusicBot-0.7.0.jar" -o JMusicBot-fork.jar
```

### Step 2: Patch the JAR with Python

**CRITICAL**: Replace ONLY the `dev/lavalink/youtube/` classes with 1.18.2 versions, EXCLUDING the `/plugin/` subdirectory (that's for Lavalink server, not JMusicBot). Update `yts-version.txt` resource to `1.18.2`.

```python
import zipfile, os

plugin_jar = 'youtube-plugin-1.18.2.jar'
src = zipfile.ZipFile(plugin_jar)
new_entries = {}
for n in src.namelist():
    if n.startswith('dev/lavalink/youtube/') and n.endswith('.class') and '/plugin/' not in n:
        new_entries[n] = src.read(n)
new_entries['yts-version.txt'] = b'1.18.2'
src.close()

target_jar = 'JMusicBot-fork.jar'  # or /home/container/JMusicBot.jar from container
dst = zipfile.ZipFile(target_jar)

output_jar = 'JMusicBot-patched.jar'
with zipfile.ZipFile(output_jar, 'w', zipfile.ZIP_DEFLATED) as out:
    for item in dst.infolist():
        name = item.filename
        if name in new_entries:
            out.writestr(name, new_entries.pop(name))
        elif name.startswith('dev/lavalink/youtube/') and name.endswith('.class') and '/plugin/' not in name:
            continue  # drop old class, will write from plugin
        else:
            out.writestr(item, dst.read(name))
    for name, data in new_entries.items():
        out.writestr(name, data)
dst.close()
print(f"Patched: {os.path.getsize(output_jar)} bytes")
```

### Step 3: Deploy to Docker container

```bash
# Stop the existing bot first
docker stop <container_id>
# Copy patched JAR
docker cp JMusicBot-patched.jar <container_id>:/home/container/JMusicBot.jar
# Ensure correct ownership
docker exec <container_id> chown container:container /home/container/JMusicBot.jar
docker exec <container_id> rm -f /home/container/youtubetoken.txt /home/container/.jmusicbot.lock
# Fix config.txt: restore from backup and add playback block
docker exec <container_id> cp /home/container/config.txt.bak /home/container/config.txt
docker exec <container_id> bash -c "cat >> /home/container/config.txt << 'EOF'

playback {
  youtube {
    useOAuth = true
  }
}
EOF"
# Kill any stray processes and restart
docker exec <container_id> ps aux | grep java
docker restart <container_id>
```

**Note**: After restart, if bot shows "Please provide a bot token", the config.txt was corrupted by the Pelican migration system (duplicate token/owner lines). Restore from config.txt.bak: `docker exec <id> cp /home/container/config.txt.bak /home/container/config.txt`, then re-append the playback block.

### Step 3b: Troubleshooting "Please provide a bot token"

If after restart the bot asks for a token:
1. Check config.txt is not corrupted: `docker exec <id> cat /home/container/config.txt | grep "token ="`
2. There should be exactly ONE `token =` line. If duplicates exist, restore from config.txt.bak
3. Verify the `playback { youtube { useOAuth = true } }` block is at the END of config.txt
4. Remove .jmusicbot.lock: `docker exec <id> rm -f /home/container/.jmusicbot.lock`

### Step 4: Verify

```bash
docker logs <container_id> --tail 30
# Should show YouTube access token refreshed successfully and no AllClientsFailedException
```

## Pitfalls

- **Never overwrite with official JMusicBot 0.4.3** — the container jar is a fork (0.7.0, `com.arifbanai`) with built-in OAuth v2 support. Official 0.4.3 lacks `useOAuth` support and downgrades the bot. Always use the fork JAR already in the container as the base.
- **Don't use JMusicBot.jar.old or JMusicBot.jar.bak** as source if they're copies of the OLD fork — use a fresh download if available. The backup jars are useful for reference only.
- **Plugin vs core**: youtube-plugin-1.18.2.jar contains extra files (`plugin/`, `org/mozilla/`, `com/grack/nanojson/`) that are NOT needed by JMusicBot — only replace `dev/lavalink/youtube/` classes and `yts-version.txt`
- config.txt corruption from migration can produce duplicate token/owner sections — restore from config.txt.bak
- JAR permission: file owner must be container user (UID 1000)
- After restart, check for lingering Java processes with `docker exec <id> ps aux | grep java`
- If bot asks for token on startup, config.txt is malformed — restore from config.txt.bak
- After patching, yts-version.txt inside the JAR changes from 1.18.1 to 1.18.2
- **Container restart triggers migration AGAIN**: After docker restart, the Pelican migration system may re-corrupt config.txt. Check immediately if bot asks for token.
- **Docker exec --help flag issue**: After replacing JAR, ensure no stray `--help` flag is passed. Check `docker exec <id> ps aux | grep java` and kill any non-production processes before restarting
- **JAR size change**: Original fork jar may be ~68MB. Patched version should be similar. Size difference is expected
- **After patch, token file NOT regenerated automatically**: `youtubetoken.txt` must be explicitly deleted so the bot generates a fresh OAuth token on next run
- **OAuth device flow**: After patch + token deletion, bot prints a URL and device code. Open https://www.google.com/device, enter code, authorize with a **burner** Google account (not main). Code expires quickly — if expired, restart bot to get a new code.
- **DO NOT patch JMusicBot.jar in-place while the bot is running** — the process has the JAR file locked. Stop the container first, then replace the JAR.
- **If `JMusicBot.jar` in container is the official 0.4.3 (not fork)**: Download the fork first (`curl -sL "https://github.com/arifbanai/JMusicBot/releases/download/0.7.0/JMusicBot-0.7.0.jar" -o JMusicBot-fork.jar`), patch that, then copy to container. Do NOT overwrite with official 0.4.3.
- **Multiple attempts in a row**: If patching fails after 3+ attempts, check if the JAR has a password or is a different format. Inspect with `jar tf <jar>` and look for `dev/lavalink/youtube/` entries.

## Container Details (saturia VPS)

- Container ID: c5a8486c7a10 (image: ghcr.io/pterodactyl/yolks:java_25)
- Pelican name: 5f5fdde2-bd18-4d87-905b-acdb3183f30c
- Working dir: /home/container/
- Config: /home/container/config.txt
- Token cache: /home/container/youtubetoken.txt
- Backup jar: /home/container/JMusicBot.jar.bak
- Backup config: /home/container/config.txt.bak
- Restart: docker restart c5a8486c7a10
- Logs: docker logs c5a8486c7a10 --tail 50

## Verification

After restart, confirm:
```bash
# No AllClientsFailedException in logs
docker logs <container_id> --tail 30 | grep -i "error\|fail\|exception\|youtube\|yts"
# Should show OAuth success
docker logs <container_id> --tail 30 | grep -i "oauth\|token refresh"
# Bot should be logged in
docker logs <container_id> --tail 5 | grep -i "login successful\|connected to websocket"
# Check yts-version is 1.18.2
docker exec <id> cat /home/container/JMusicBot.jar | strings | grep "yts.version"
```

## Key learnings from this session

- **Use the fork JAR as the base** — the official 0.4.3 JAR is the wrong source. The container already has the fork (com.arifbanai 0.7.0) with OAuth v2 support. Always download youtube-source plugin and patch the existing JAR, don't replace it with official 0.4.3.
- After patching and restarting, if bot shows "Please provide a bot token", the config.txt was likely corrupted by the Pelican Panel migration system. The migration appended duplicate `token` and `owner` lines. Restore from config.txt.bak and append the playback block manually.
- Docker restart can trigger the migration AGAIN, re-corrupting config.txt. Check config.txt immediately after restart if the bot asks for a token.
- After replacing the JAR, if the bot process has a `--help` flag being passed (stray from container entrypoint), it will prompt for token. Kill stale processes before restarting.
- The original JMusicBot.jar in the container was ~68MB with bundled native libraries. The patched version is ~44MB. Size difference is expected and NOT a problem.
- `youtubetoken.txt` must be explicitly deleted before restart — the bot does not auto-regenerate it after patching.
