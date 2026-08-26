# Calagopus (game server panel) — deploy + theming on saturia VPS

Calagopus is a Rust game-server panel (Pterodactyl alternative). Installed 2026-08-24 behind the tunnel
as `panel.saturia.codes` and `panel.satzz.online`.

## Deploy (All-in-One Docker, single node)
- Docker was installed this session (was not present before): `curl -fsSL https://get.docker.com | sudo sh`.
  Post-install: `sudo usermod -aG docker saturia` (group applies on new login; use `sudo docker …` in same session).
- Files: `/opt/calagopus-panel/compose.yml` (image `ghcr.io/calagopus/panel:aio`), data vols in same dir.
- `wings-config.yml` MUST exist before first `up` (else Docker creates it as a directory and the container dies):
  `echo 'app_name: Calagopus' > wings-config.yml`
- Set `APP_ENCRYPTION_KEY`: `sed -i "s/CHANGEME/$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)/g" compose.yml`
- `TZ=Asia/Jakarta`. Ports: web 8000, SFTP 2022. Stack also spins Postgres 18 + Valkey.
- `sudo docker compose up -d` (the terminal tool's heuristic flags `docker compose up -d` as a long-running
  server and refuses; run it directly or with `background=true` + `notify_on_complete`).

## OOBE wizard gotchas
- **SFTP Host** must be ≥3 chars or it errors `sftp_host: length is lower than 3`. Use `panel.satzz.online`.
- Node Configuration is pre-filled by AIO; leave URL `http://localhost:64332/`, Public URL the wings-proxy URL,
  SFTP Port `2022`. Memory/Disk: 8 GiB / 29 GiB by default.
- Allocations port range must NOT collide with existing services: 4000 (api), 8000 (panel), 9119 (agent),
  20128 (9router), 2022 (sftp). Use e.g. `3000-3999` or `5000-7000`.

## Permanent server-side theming (no Stylus, all viewers)
Calagopus has NO custom-CSS env var and the frontend is bundled in the container, so inject via an nginx
reverse proxy in front of the panel.
1. `sudo apt-get install -y nginx`.
2. Theme CSS at `/var/www/calagopus-theme/theme.css` (override `--mantine-color-*` vars; Calagopus uses
   Mantine — tokens like `--mantine-color-blue-5`, `--mantine-color-dark-7` for dark surface).
3. nginx site (port 80) proxies `127.0.0.1:8000` and injects the CSS:
   ```nginx
   server {
     listen 80;
     location = /saturia-theme.css { alias /var/www/calagopus-theme/theme.css; add_header Content-Type text/css; }
     location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
       sub_filter '</head>' '<link rel="stylesheet" href="/saturia-theme.css"></head>';
       sub_filter_once on;
     }
   }
   ```
4. Disable default site (`rm /etc/nginx/sites-enabled/default`), `nginx -t`, `systemctl enable --now nginx`.
5. Point the tunnel `panel.*` ingress to `http://localhost:80` (not 8000) and restart cloudflared.
6. To recolor later: edit the CSS, `sudo systemctl reload nginx`. No panel restart needed.
- Note: `sub_filter` only rewrites responses with a `Content-Type` matching `text/html` by default — fine here.
- Pterodactyl-style "Blueprint/Ccarbon" theme marketplace does NOT exist for Calagopus yet; theming is either
  this nginx-injection route or a `:heavy` image + extension (overkill for a color reskin).
