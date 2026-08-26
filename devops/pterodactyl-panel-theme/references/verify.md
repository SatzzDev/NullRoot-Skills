# Verify a gold-dark Pterodactyl rebuild

Run from `/var/www/pterodactyl`. Do NOT trust "it built" — confirm the gold hex
actually landed and the panel serves 200.

## 1. Gold hex is in the JS bundle (NOT .css)
Pterodactyl compiles Tailwind utilities into the JS bundle via twin.macro / styled-components.
A static `.css` grep returns 0 even when theming worked.

```bash
grep -ro "d4af37" public/assets/*.js | wc -l      # expect > 0
grep -rl "d4af37" public/assets/*.js              # list files
```
Expected: `bundle.*.js` (and possibly vendor `972.*.js`) contain `#d4af37`.

## 2. Panel serves HTTP 200, no error
```bash
curl -s -o /tmp/panel.html -w "HTTP %{http_code}\n" http://127.0.0.1/
grep -c "exception\|error" /tmp/panel.html        # expect 0 (for a clean page)
grep -o "manifest.json\|<hash>" /tmp/panel.html   # confirm new bundle referenced
```

## 3. No root-owned storage (would 500)
```bash
sudo chown -R www-data:www-data storage bootstrap/cache public/assets
sudo -u www-data php artisan view:clear
sudo -u www-data php artisan config:clear
ls -ld storage/framework/views                    # should be www-data:www-data
```

## 4. nginx + php-fpm healthy
```bash
systemctl is-active nginx php8.3-fpm              # both 'active'
sudo nginx -t                                     # syntax ok
```

## 5. Visual sanity (optional)
Log into the panel; primary buttons/links should render gold (#d4af37 / #b8860b),
body background near-black (neutral-900). Scrollbar thumb edges gold.
