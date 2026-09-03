# Automated Multi-Service Backup & Migration Pattern (saturia VPS)

When backing up or preparing to migrate a multi-service VPS hosting Pelican Panel, 9Router, Hermes Agent, Custom Node APIs, and Cloudflare Tunnels:

## Backup Targets & Exclusions
1. **Pelican Panel**:
   - Dump MySQL: `mysqldump -u saturia -p3551 pelican > pelican.sql`
   - Archive config & plugins: include `.env`, `storage/`, `plugins/`. Exclude `node_modules`, `vendor`, cache, logs, views.
2. **9Router**:
   - Directory: `~/.9router/`
   - Include: `db/` (SQLite), `auth/`, `model-catalog*.json`, `jwt-secret`, `machine-id`.
   - Exclude: `logs/`.
3. **api.saturia.codes**:
   - Source directory `~/api-saturia-codes`.
   - Exclude: `node_modules/`.
4. **Hermes Agent**:
   - Include: `~/.hermes/config.yaml`, `.env`, `auth.json`, `state.db`, `skills/`, `scripts/`.
   - **Crucial exclusions** (prevent 10GB+ bloated repos): exclude `backups/`, `hermes-agent/` (git repo), `node/`, `venv/`, `lsp/`, `logs/`, `cache/`, `state-snapshots/`.
5. **System Configs**:
   - Cloudflare tunnel `/etc/cloudflared/`
   - Nginx `/etc/nginx/sites-available` & `sites-enabled`
   - Systemd units (`/etc/systemd/system/9router.service`, `pelican.service`, `~/.config/systemd/user/hermes-gateway.service`).

## GitHub Automation via Token
- Use `GITHUB_TOKEN` from `~/.hermes/.env`.
- Create private repo using `gh repo create <org>/<repo> --private`.
- Authenticate git remote using `https://<user>:${GITHUB_TOKEN}@github.com/<org>/<repo>.git`.
- Script: `/home/saturia/backup-all.sh`.
- Nightly cron in `crontab -e`: `0 18 * * * /home/saturia/backup-all.sh >> /home/saturia/.hermes/logs/backup-all.log 2>&1` (18:00 UTC = 01:00 WIB, staggered 1 hour after Hermes self-update cron at 17:00 UTC).

## Migration Recovery Flow
1. Clone backup repo onto fresh box.
2. Restore MySQL dump: `mysql -u <user> -p pelican < latest/pelican.sql`.
3. Untar `latest/pelican-config.tar.gz` into `/var/www/pelican` and run `composer install && npm install`.
4. Untar `latest/9router.tar.gz` into `~/.9router` and enable systemd unit.
5. Untar `latest/hermes.tar.gz` into `~/.hermes/`.
6. Restore `/etc/cloudflared/` and systemd units, then reload daemons.
