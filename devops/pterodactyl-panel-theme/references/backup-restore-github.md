# SaturiaHost Backup-to-GitHub + 1-command Restore

## Purpose (user intent, 2026-08-26)
If the VPS dies / user moves VPS, restore the whole panel with ONE script from a
GitHub repo. The GitHub export is NOT for collaboration — it's a portable restore.

## GitHub setup
- Repo: `SatzzDev/saturiahost-pterodactyl-source` (PRIVATE).
- Token: `SATZZDEV_GITHUB` in `~/.hermes/.env` (classic PAT, scope `repo`).
  - The `.hermes/.env` `GITHUB_TOKEN` is a FINE-GRAINED token for the SKILLS HUB
    — read-only, CANNOT create repos, and returns 404 on repo it lacks access to.
    Do NOT confuse it with `SATZZDEV_GITHUB`.
  - `SATZZDEV_GITHUB` creates + pushes; set `permissions.push=true`.
  - gh CLI reads `GITHUB_TOKEN`/`GH_TOKEN`, not `SATZZDEV_GITHUB` — use curl with
    `SATZZDEV_GITHUB` explicitly, not `gh` (gh confuses the two env's).

## Local backup snapshot
The portable unit is a git repo at `/home/saturia/backups/pterodactyl-repo`,
rsync-ed clean from `/var/www/pterodactyl` excluding runtime/secrets:
```bash
rsync -a --exclude='.git' --exclude='node_modules' --exclude='vendor' \
  --exclude='storage/logs' --exclude='storage/framework/{cache,sessions,views}/*' \
  --exclude='public/assets' --exclude='.env' --exclude='.env.*' \
  --exclude='composer.lock' --exclude='yarn.lock' --exclude='.gitignore' \
  /var/www/pterodactyl/ <repo>/
```
The repo is SELF-CONTAINED (no `panel/` subdir — source files at repo root) plus
these assets:
- `install.sh` — restore script (see below)
- `database.sql` — fresh `mysqldump` of `SaturiaHost` DB
- `nginx-pterodactyl.conf` — live nginx site conf
- `crontab.txt` — root crontab (laravel scheduler line)
- `panel.env` — `.env` template the installer copies to `.env`

## Push (create + push private repo)
```bash
export SATZZDEV_GITHUB=$(grep '^SATZZDEV_GITHUB=' ~/.hermes/.env | cut -d= -f2-)
# create (only if absent; 404 = doesn't exist yet)
curl -s -H "Authorization: Bearer $SATZZDEV_GITHUB" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d '{"name":"saturiahost-pterodactyl-source","private":true}'
# push
git remote set-url origin "https://x-access-token:${SATZZDEV_GITHUB}@github.com/SatzzDev/saturiahost-pterodactyl-source.git"
git push -u origin main
git remote set-url origin https://github.com/SatzzDev/saturiahost-pterodactyl-source.git  # strip token
```
ALWAYS strip the token from the remote URL after pushing.

## Fresh DB dump (before committing a new database.sql)
Use the REAL password from `panel/.env`, not the hardcoded `3551` (memory had it
wrong). Read it via `source /var/www/pterodactyl/.env`:
```bash
set -a; source /var/www/pterodactyl/.env; set +a
mysqldump -u"$DB_USERNAME" -p"$DB_PASSWORD" -h"${DB_HOST:-127.0.0.1}" \
  --single-transaction --routines --triggers "$DB_DATABASE" > database.sql
```

## install.sh behavior (self-contained restore)
- Ubuntu 24.04: installs nginx, php8.3 + extensions, mariadb, redis, supervisor,
  composer, node22 via nodesource, yarn globally.
- Creates DB + user from `panel.env`, imports `database.sql`.
- Copies source files (app/, resources/, public/, routes/, config/, ...) + loose
  files into `/var/www/pterodactyl`.
- Writes `.env` from `panel.env`; auto-generates `APP_KEY` if missing/empty:
  `APP_KEY=base64:$(openssl rand -base64 32)`.
- `composer install`, `yarn install`, `NODE_OPTIONS=--openssl-legacy-provider
  yarn build:production`.
- `chown -R www-data:www-data` (critical — otherwise HTTP 500).
- nginx conf (repo's or inline default with `^/assets/` no-cache block), supervisor
  queue worker, crontab laravel scheduler, `php artisan storage:link|view:clear|config:clear`.
- Post steps printed: certbot SSL + cloudflared tunnel.

## Security
- Repo is PRIVATE; still excluded: `.env`, `composer.lock`, `yarn.lock`, `public/assets`, vendor.
- `panel.env` carries the real `DB_PASSWORD` + `REDIS_PASSWORD` (needed for restore) —
  fine for a private repo, do NOT make the repo public.
- After every push, strip the token from the remote URL.