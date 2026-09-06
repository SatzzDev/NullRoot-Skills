# JMusicBot YouTube Lavalink Fix

## Symptom

JMusicBot Docker container logs show:
```
dev.lavalink.youtube.AllClientsFailedException: (yts.version: 1.18.1) All clients failed to load the item.
Client [TVHTML5] failed: The page needs to be reloaded.
Client [TVHTML5_SIMPLY] failed: Sign in to confirm you're not a bot
```

## Root Cause

JMusicBot bundles Lavalink YouTube plugin v1.18.1. YouTube permanently blocks TVHTML5 and TVHTML5_SIMPLY clients. JMusicBot 0.4.3 release notes explicitly state this release will not resolve the issue. Setting `useOAuth = true` does NOT fix it — the problem is at the Lavalink library level.

## Fix: Patch Lavalink YouTube plugin inside JMusicBot.jar

### Step 1: Download artifacts

```bash
curl -sL "https://github.com/jagrosh/MusicBot/releases/download/0.4.3/JMusicBot-0.4.3.jar" -o JMusicBot-0.4.3.jar
curl -sL "https://github.com/lavalink-devs/youtube-source/releases/download/1.18.2/youtube-plugin-1.18.2.jar" -o youtube-plugin-1.18.2.jar
```

### Step 2: Patch with Python

```python
import zipfile, os

plugin_jar = 'youtube-plugin-1.18.2.jar'
target_jar = 'JMusicBot-0.4.3.jar'
output_jar = 'JMusicBot-patched.jar'

src = zipfile.ZipFile(plugin_jar)
dst = zipfile.ZipFile(target_jar)
plugin_lav_files = {n for n in src.namelist() if n.startswith('dev/lavalink/youtube/')}

with zipfile.ZipFile(output_jar, 'w', zipfile.ZIP_DEFLATED) as out:
    for item in dst.infolist():
        if item.filename not in plugin_lav_files:
            out.writestr(item, dst.read(item.filename))
    for name in plugin_lav_files:
        out.writestr(name, src.read(name))
    for name in src.namelist():
        if not name.startswith('dev/lavalink/youtube/') and name not in out.namelist():
            out.writestr(name, src.read(name))

dst.close(); src.close()
print(f"Patched: {os.path.getsize(output_jar)} bytes")
```

### Step 3: Deploy

```bash
docker cp JMusicBot-patched.jar <container_id>:/home/container/JMusicBot.jar
docker exec <container_id> rm -f /home/container/youtubetoken.txt
# Add to config.txt:
# playback { youtube { useOAuth = true } }
docker restart <container_id>
```

### Step 4: Verify

```bash
docker logs <container_id> --tail 30
# Should show "YouTube access token refreshed successfully" and no AllClientsFailedException
```

## Pitfalls

- Don't use JMusicBot.jar.old as source — use fresh download from GitHub
- config.txt corruption from migration can produce duplicate token/owner sections — restore from config.txt.bak
- JAR permission: file owner must be container user (UID 1000)
- After restart, check for lingering Java processes with `docker exec <id> ps aux | grep java`
- If bot asks for token on startup, config.txt is malformed — restore from config.txt.bak
- After patching, yts-version.txt inside the JAR changes from 1.18.1 to 1.18.2
- JMusicBot 0.4.3 is still the latest — no newer official version exists
