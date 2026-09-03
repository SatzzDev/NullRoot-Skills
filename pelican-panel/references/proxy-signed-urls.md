# Reverse Proxy Signed URL Debugging

## Error Payload

```json
{
    "errors": [
        {
            "code": "HttpException",
            "status": "401",
            "source": {
                "line": 1447,
                "file": "/vendor/laravel/framework/src/Illuminate/Foundation/Application.php"
            },
            "meta": {
                "trace": [
                    {
                        "file": "/vendor/livewire/livewire/src/Features/SupportFileUploads/FileUploadController.php",
                        "line": 29,
                        "function": "abort_unless"
                    }
                ]
            }
        }
    ]
}
```

This 401 occurs on the **livewire.upload-file** POST route when uploading plugins via the Pelican admin panel behind a Cloudflare Tunnel or reverse proxy.

## Debugging Steps

### Step 1: Confirm the symptom

- Plugin upload in admin panel fails silently or returns 401
- Error appears in `/var/www/pelican/storage/logs/laravel.log`
- The trace shows `abort_unless(request()->hasValidSignature(), 401)` at `FileUploadController.php:29`

### Step 2: Identify proxy setup

Check if the panel runs behind Cloudflare Tunnel:
```bash
# Check if CF tunnel is running
cloudflared tunnel list

# Check APP_URL in .env
grep APP_URL /var/www/pelican/.env
```

If `APP_URL=https://` and the panel is behind Cloudflare Tunnel, you have a scheme mismatch.

### Step 3: Trace the signature logic

1. Livewire's `GenerateSignedUploadUrl::forLocal()` generates a `temporarySignedRoute('livewire.upload-file', ...)` (see `FileUploadConfiguration.php` line 13-14)
2. The URL is signed with the current scheme — `https://` because `URL::forceHttps(true)` in `AppServiceProvider::boot()`
3. The upload POST hits the server via HTTP (proxy forwards as HTTP)
4. `request()->hasValidSignature()` compares the signed URL against the incoming request — scheme mismatch → invalid

### Step 4: Verify no TrustProxies is registered

```bash
grep -rn "TrustProxies" /var/www/pelican/app/ /var/www/pelican/config/ /var/www/pelican/bootstrap/app.php
```

If no matches, the middleware is missing.

### Step 5: Apply the fix

See the main skill section **Reverse Proxy / Cloudflare Tunnel (SSL Termination)** for the `bootstrap/app.php` changes.

### Step 6: Verify

```bash
# Clear all caches
cd /var/www/pelican
sudo -u www-data php artisan config:clear
sudo -u www-data php artisan cache:clear
sudo -u www-data php artisan view:clear
```

Then retry the plugin upload.

## Key Files

| File | Role |
|------|------|
| `bootstrap/app.php` | Register TrustProxies middleware |
| `app/Providers/AppServiceProvider.php` | `URL::forceHttps(true)` triggers the mismatch |
| `vendor/livewire/livewire/src/Features/SupportFileUploads/FileUploadController.php:29` | Where the 401 is thrown |
| `vendor/livewire/livewire/src/Features/SupportFileUploads/GenerateSignedUploadUrl.php:13-14` | Where the signed URL is generated |

## Why trustProxies(at: '*') is safe

- Cloudflare Tunnel is the only inbound path to the panel
- No direct HTTP access from the internet
- The tunnel enforces its own authentication/encryption
- Trusting all proxies in this context is equivalent to trusting the tunnel itself
