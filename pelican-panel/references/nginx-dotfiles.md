# Nginx Dotfile Fix for Pelican File Manager

## The Problem

When trying to edit dotfiles (`.env`, `.config`, `.npm`) in the Pelican web file manager, you get:
```
403 Forbidden
nginx/1.24.0 (Ubuntu)
```

Nginx error log shows:
```
access forbidden by rule, client: 127.0.0.1, request: "GET /server/<id>/files/edit/.env/ HTTP/1.1"
```

## Root Cause

The Pelican nginx config includes a security rule that blocks all dotfiles:
```nginx
location ~ /\.(?!well-known).* {
    deny all;
}
```

This is overly restrictive for the file manager, which needs to edit game server config files like `.env`.

## The Fix

### Step 1: Edit the nginx config

```bash
sudo nano /etc/nginx/sites-enabled/pelican
```

### Step 2: Remove or comment out the dotfile rule

```nginx
# Remove or comment out:
# location ~ /\.(?!well-known).* {
#     deny all;
# }
```

### Step 3: Test and reload

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Why This Is Safe

- Panel authentication is handled by PHP (Laravel), not nginx
- The file manager requires login and proper permissions
- The nginx rule is redundant security that breaks functionality

## Full Working Config

```nginx
server {
    listen 127.0.0.1:8088;
    listen [::1]:8088;
    server_name panel.saturia.codes;

    root /srv/pelican/public;
    index index.php;

    client_max_body_size 100M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_read_timeout 120;
    }
}
```
