# Docker Container Reference (saturia VPS)

## JMusicBot Container
- Container ID: `c5a8486c7a10`
- Image: `ghcr.io/pterodactyl/yolks:java_25`
- Pelican name: `5f5fdde2-bd18-4d87-905b-acdb3183f30c`
- Working dir: `/home/container/`
- Main jar: `/home/container/JMusicBot.jar`
- Config: `/home/container/config.txt`
- Token cache: `/home/container/youtubetoken.txt`
- Backup jar: `/home/container/JMusicBot.jar.bak`
- Backup config: `/home/container/config.txt.bak`
- Java: OpenJDK 25.0.4 LTS
- Management: Pelican Panel / Wings daemon
- Restart: `docker restart c5a8486c7a10`
- Logs: `docker logs c5a8486c7a10 --tail 50`

## Node.js Bot Container
- Container ID: `0960a1157fac`
- Image: `ghcr.io/ptero-eggs/yolks:nodejs_25`
- Pelican name: `1b9876db-1bd2-4a50-b98e-e35304388b53`

## Java Container (another game server)
- Container ID: `95a9e3684d67`
- Status: Created (not running)
