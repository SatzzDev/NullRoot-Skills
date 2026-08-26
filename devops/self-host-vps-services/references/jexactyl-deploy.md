# Jexactyl v3.1.0 deploy (PHP/Laravel Pterodactyl fork)

Stack: PHP 8.3-fpm + MariaDB 10.11 + nginx 1.24 + Composer 2.8 + Redis + Node 22 (build only).
Install root: `/var/www/jexactyl`. Served at `panel.satzz.online` via Cloudflared tunnel -> localhost:80.

## Prereqs
sudo apt install -y php8.3-fpm php8.3-cli php8.3-common php8.3-mysql php8.3-mbstring php8.3-xml php8.3-bcmath php8.3-curl php8.3-gd php8.3-zip php8.3-intl php8.3-redis mariadb-server redis-server nginx composer

## Install + bootstrap
cd /var/www/jexactyl
sudo composer install --no-dev --optimize-autoloader
# APP_KEY: artisan can't boot with empty key -> set manually first
sudo sed -i "s#^APP_KEY=.*#APP_KEY=base64:$(openssl rand -base64 32)#" .env
# Carbon conflict on PHP 8.3 patch (setLastErrors bug): pin compatible Carbon
sudo composer require nesbot/carbon:^2.58 --no-interaction
sudo php artisan key:generate --force
sudo php artisan migrate --seed --force
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 755 storage bootstrap/cache
sudo php artisan config:cache && sudo php artisan route:cache && sudo php artisan view:cache

## Frontend build (Node 22)
sudo npm install --legacy-peer-deps
sudo NODE_OPTIONS=--openssl-legacy-provider npm run build   # OpenSSL3 breaks old webpack (ERR_OSSL_EVP_UNSUPPORTED)

## .env essentials
APP_URL=https://panel.satzz.online
DB_HOST=localhost        # socket; 127.0.0.1 forces TCP -> "Access denied" for jexactyl@localhost
DB_CONNECTION=mysql
After editing APP_URL: sudo php artisan config:cache

## nginx vhost (/etc/nginx/sites-available/jexactyl)
server { listen 80; server_name panel.satzz.online;
  root /var/www/jexactyl/public; index index.php index.html;
  location / { try_files $uri $uri/ /index.php?$query_string; }
  location ~ \.php$ { include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;   # SOCKET, not 127.0.0.1:9000
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name; include fastcgi_params; }
  location ~ /\.(?!well-known).* { deny all; } }
sudo ln -s /etc/nginx/sites-available/jexactyl /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

## Queue worker (REQUIRED)
/etc/systemd/system/jexactyl-queue.service:
[Unit] Description=Jexactyl Queue Worker After=network.target
[Service] User=www-data Group=www-data Restart=always
ExecStart=/usr/bin/php /var/www/jexactyl/artisan queue:work --queue=high,standard,low --sleep=3 --tries=3
[Install] WantedBy=multi-user.target
sudo systemctl daemon-reload && sudo systemctl enable --now jexactyl-queue

## Verify (local)
curl -s -o /dev/null -w "%{http_code}\n" --resolve panel.satzz.online:80:127.0.0.1 http://panel.satzz.online/
# expect 200 + <title>Pterodactyl</title>

## Expose (Azure NSG blocks inbound 80/443 -> use tunnel, NOT A-record)
Add to /etc/cloudflared/config.yml ingress (ABOVE the http_status:404 catch-all):
  - hostname: panel.satzz.online
    service: http://localhost:80
sudo systemctl restart cloudflared
DNS: Cloudflare CNAME panel -> <tunnel-id>.cfargotunnel.com, proxied. The agent CANNOT self-set DNS:
/etc/cloudflared/token is a tunnel RUN-TOKEN (JWT {"a":..,"t":..}), not a cfut_ API token, and cert.pem is absent.
