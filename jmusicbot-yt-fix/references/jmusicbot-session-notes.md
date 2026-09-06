# JMusicBot YouTube Lavalink Fix (Session Notes)

## What happened

JMusicBot on Pelican Panel Docker container (java_25) threw:
```
dev.lavalink.youtube.AllClientsFailedException: (yts.version: 1.18.1) All clients failed to load the item.
Client [TVHTML5] failed: The page needs to be reloaded.
Client [TVHTML5_SIMPLY] failed: Sign in to confirm you're not a bot
```

## Resolution steps

1. Downloaded JMusicBot-0.4.3.jar (44MB) from GitHub releases
2. Downloaded youtube-plugin-1.18.2.jar from lavalink-devs/youtube-source releases
3. Patched JMusicBot.jar by replacing dev/lavalink/youtube/ classes with the new plugin
4. Removed /home/container/youtubetoken.txt to force fresh OAuth
5. Fixed config.txt (was corrupted with duplicate token/owner from migration) by restoring from config.txt.bak
6. Added playback { youtube { useOAuth = true } } block to config.txt
7. Restarted container with docker restart c5a8486c7a10
8. Bot logged in successfully, no more AllClientsFailedException

## Key learnings

- JMusicBot 0.4.3 release notes explicitly say this release will not resolve the Sign in to confirm you are not a bot issue
- useOAuth = true alone does NOT fix the error -- it is a Lavalink library version issue
- The fix is patching the JAR, not updating config
- After patching, yts-version.txt inside the JAR changes from 1.18.1 to 1.18.2
- Config.txt corruption from double migration was a secondary issue

## Artifacts

- /home/saturia/JMusicBot-0.4.3.jar -- fresh download
- /home/saturia/youtube-plugin-1.18.2.jar -- the replacement plugin
- /home/saturia/JMusicBot-0.4.3-new.jar -- the patched result (before copying to container)
