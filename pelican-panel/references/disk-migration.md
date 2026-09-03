# Disk Migration / Path Change Checklist for Pelican Panel

## Scenario

The panel was reinstalled on a new disk (e.g. from `/srv/pelican` to `/var/www/pelican`). Several systemd units and configs still reference the old path.

## Common Pitfall: Queue Worker Unit Fails Silently

The `pelican.service` unit pointed to `/srv/pelican/artisan`. After migration, that path no longer exists. The unit fails with:

```
Could not open input file: /srv/pelican/artisan
```

Systemd auto-restarts every 5s, racking up thousands of restarts without anyone noticing. Plugin install jobs sit in the `jobs` table forever.

### Fix

```bash
# Fix the unit
sudo sed -i 's|/srv/pelican/artisan|/var/www/pelican/artisan|' /etc/systemd/system/pelican.service
sudo systemctl daemon-reload
sudo systemctl restart pelican.service
```

### Verify

```bash
systemctl status pelican.service
journalctl -u pelican.service --no-pager -n 10
```

Should show `active (running)` and jobs processing.

## Other Path References to Update

| Config | What to check |
|--------|---------------|
| `/etc/systemd/system/pelican.service` | `ExecStart` artisan path |
| `/etc/systemd/system/wings.service` | Wings daemon path |
| nginx config | `root` directive for panel |
| Cloudflare Tunnel config | `service` URL if pointing to local socket |
| Cron jobs | artisan path in crontab |

## Wing's config.yml Location

Wings looks for `/etc/pelican/config.yml`. If the panel was at `/srv/pelican` and Wings was configured there, you need to move or reconfigure:

```bash
sudo wings configure --panel-url https://panel.saturia.codes --token <papp_token> --node 1 --allow-insecure
```

This regenerates `/etc/pelican/config.yml`.

## Database Credentials

After a fresh install, the panel creates a new DB. The user's Pelican panel uses:
- DB: `pelican`
- User: `saturia`
- Password: `3551`

## Plugin Recovery

Plugins from the old installation are NOT auto-carried over. You must reinstall them:

```bash
cd /var/www/pelican
sudo -u www-data php artisan p:plugin:list          # see what's installed
sudo -u www-data php artisan p:plugin:install <name> # reinstall
```

Plugins that were installed: deepfield, nord-theme, donations, discord-webhooks, announcements, theme-customizer.
