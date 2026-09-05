# Subdomains Plugin Setup & Troubleshooting

## Plugin Overview

The **Subdomains** plugin (Boy132 & HarlequinSin) allows users to create DNS subdomains for their game servers via Cloudflare API. It automatically creates A/AAAA or SRV records.

Hub URL: https://hub.pelican.dev/plugins/subdomains

## Installation

```bash
cd /var/www/pelican
sudo -u www-data php artisan p:plugin:install subdomains
```

Or via admin panel → Plugins → search "subdomains" → Install.

## Configuration (Admin Panel)

1. **Admin → Plugins → Subdomains → Settings**
2. Fill in:
   - **Domain**: `saturia.codes` (your root domain)
   - **Cloudflare API Token**: scoped token with **Zone → DNS → Edit** permission
   - **Contact Email**: your email (for Cloudflare API)
   - **Subdomain Blacklist**: comma-separated list of reserved names (e.g., `panel,api,www,mail,9router,agent`). Supports wildcards like `test*`.

### Creating the Cloudflare API Token

1. dash.cloudflare.com → My Profile → API Tokens → Create Token
2. Use the **Edit zone DNS** template
3. Permissions: **Zone → DNS → Edit**
4. Zone Resources: **Include → Specific zone → saturia.codes**
5. Create Token → copy the token → paste into plugin settings

## Usage (User Side)

1. Open a server → **Settings → Subdomains**
2. Click **New Subdomain** (if enabled)
3. Fill in:
   - **Subdomain**: lowercase alphanumeric + hyphens (e.g., `mc-survival`)
   - **Type**: A/AAAA (standard DNS) or SRV (Minecraft/game-specific, port-less connect)
   - **Description**: optional notes
4. Submit → plugin creates the DNS record in Cloudflare

## Troubleshooting

### "New Subdomain" Button is Disabled

**Cause:** The server's primary allocation uses a non-public IP:
- `0.0.0.0` or `::`
- Private IP ranges: `172.x.x.x`, `10.x.x.x`, `192.168.x.x`
- Docker bridge IPs: `172.17.x.x`, `172.19.x.x`

The plugin refuses to create DNS records for these because they're not internet-routable.

**Fix:**

1. **Assign a public allocation:**
   - Admin panel → Nodes → [node] → Allocation tab
   - Create or assign `5.62.139.35:<port>` (your VPS public IP)
   - Admin panel → Servers → [server] → Settings
   - Change **Primary Allocation** to the public IP
   - Refresh the server page → button becomes active

2. **Azure/NAT environment workaround:**
   - If Docker cannot bind to the public IP (Azure NAT edge routing), allocations must use `0.0.0.0`
   - In this case, the plugin button stays disabled
   - **Manual DNS:** create A records in Cloudflare dashboard: `subdomain.saturia.codes` → `5.62.139.35`
   - Or use SRV records for Minecraft servers (see below)

### Permissions Not Set for Users

After plugin install, only **admin** role has `subdomain` and `subdomain.delete` permissions enabled by default. Regular users won't see the Subdomains tab.

**Fix:**

```sql
UPDATE permission_role SET enabled = 1
WHERE role_id = 2  -- 2 = 'user' role
  AND permission_id IN (
    SELECT id FROM permissions WHERE permission IN ('subdomain', 'subdomain.delete')
  );
```

Then clear cache:

```bash
sudo -u www-data php artisan cache:clear
sudo systemctl restart pelican.service
```

Users need to logout → login for the tab to appear.

### SRV Record Option Missing

SRV records (port-less connect) only appear if the egg has a matching **feature** defined.

For Minecraft servers, add `srv-minecraft` to the egg's features:

1. **Admin → Eggs → [Minecraft egg] → Edit**
2. Scroll to **Features** field
3. Add `srv-minecraft` (comma-separated if other features exist)
4. Save

Now the Subdomains form shows **Type: SRV** as an option.

### DNS Record Not Resolving

After creating a subdomain:

1. Check Cloudflare dashboard → DNS Records
2. Confirm the record exists: `subdomain.saturia.codes` → A record → IP
3. Ensure the record is **DNS-only (gray cloud)**, not Proxied (orange cloud)
   - Game traffic is not HTTP — Cloudflare proxy breaks non-web protocols
4. DNS propagation: `dig subdomain.saturia.codes` or `nslookup subdomain.saturia.codes`

Propagation is usually instant for Cloudflare, but clients may cache old results for TTL duration.

## Manual SRV Record (for 0.0.0.0 Allocations)

When the plugin cannot be used (Azure NAT, `0.0.0.0` allocation), create SRV records manually in Cloudflare:

1. Cloudflare dashboard → saturia.codes → DNS → Add record
2. **Type**: SRV
3. **Name**: `_minecraft._tcp.mc` (creates `mc.saturia.codes`)
4. **Service**: `_minecraft`
5. **Protocol**: `_tcp`
6. **Priority**: 0
7. **Weight**: 5
8. **Port**: 25565 (the actual game port)
9. **Target**: `saturia.codes` (or any A record that resolves to `5.62.139.35`)
10. Save

Players can now connect to `mc.saturia.codes` without typing the port.

## Plugin Database Table

The plugin creates a `subdomains` table:

```sql
SELECT * FROM subdomains;
```

Columns: `id`, `server_id`, `subdomain`, `type`, `description`, `created_at`, `updated_at`.

To manually delete a subdomain:

```sql
DELETE FROM subdomains WHERE subdomain = 'test-server';
```

Then manually remove the DNS record from Cloudflare dashboard (the plugin does not auto-cleanup on delete).
