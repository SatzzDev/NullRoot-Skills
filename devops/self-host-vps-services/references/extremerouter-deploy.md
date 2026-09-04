# ExtremeRouter Deployment & Migration Guide

Verified working path on the saturia VPS (ExtremeRouter v0.8.7, systemd unit
`extremerouter.service`, runs `/home/saturia/.local/lib/node_modules/@rsalmn/extremerouter/app/server.js`).

## Migration from 9Router

ExtremeRouter is a 9Router fork with 304+ providers (vs ~90 in original). Data
migrates non-destructively — both can coexist on disk.

### Pre-migration checklist
- Backup current 9Router data: `tar -czf /tmp/9router-backup.tar.gz -C /home/saturia .9router`
- Verify `machine-id` and `jwt-secret` match between `~/.9router/` and what ExtremeRouter expects
- Stop 9Router cleanly before switching

### Migration steps
1. Stop and disable 9Router:
   ```bash
   sudo systemctl stop 9router
   sudo systemctl disable 9router
   ```
2. Install ExtremeRouter globally:
   ```bash
   npm install -g @rsalmn/extremerouter@latest
   ```
3. Clone/copy to `~/.extremerouter/`:
   ```bash
   cd /home/saturia
   git clone --depth 1 https://github.com/rsalmn/ExtremeRouter.git .extremerouter
   ```
4. Migrate config files from `~/.9router/` → `~/.extremerouter/`:
   ```bash
   cp -r ~/.9router/auth ~/.9router/db ~/.9router/jwt-secret ~/.9router/machine-id ~/.extremerouter/
   ```
5. Create systemd unit (see below)
6. Start ExtremeRouter: `sudo systemctl start extremerouter.service`
7. Verify: `curl http://127.0.0.1:20128/v1/models` → 200 with provider list

### Create systemd unit
`/etc/systemd/system/extremerouter.service`:
```ini
[Unit]
Description=ExtremeRouter (9Router fork)
After=network.target

[Service]
Type=simple
User=saturia
WorkingDirectory=/home/saturia/.extremerouter
ExecStart=/home/saturia/.hermes/node/bin/node /home/saturia/.local/lib/node_modules/@rsalmn/extremerouter/app/server.js --port 20128 --host 0.0.0.0 --skip-update
Environment=PORT=20128
Environment=HOSTNAME=0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl daemon-reload && sudo systemctl enable --now extremerouter.service`

### Post-migration verification
- `curl http://127.0.0.1:20128/v1/models` → provider list
- `curl http://127.0.0.1:20128/api/usage/meta` → usage stats (may fail if aggregation lag — see below)
- Dashboard accessible at `https://9router.saturia.codes` (same CF tunnel hostname)

## Authentication

### CLI token (for admin endpoints like password reset)
- Formula: `SHA256(machine_id + "9r-cli-auth" + cli_secret)` → first 16 hex chars
- `machine-id` at `~/.extremerouter/machine-id`
- `cli-secret` at `~/.extremerouter/auth/cli-secret`
- Use as header: `x-9r-cli-token: <hex>`
- Reset password: `POST /api/auth/reset-password` with `x-9r-cli-token` header (local-only endpoint)

### Dashboard login
- Default password: `123456` (set via CLI reset or `extremerouter settings`)
- Session-based browser cookies — NOT JWT Bearer tokens
- Login: `POST /api/auth/login` with username/password → session cookie
- Use browser cookies (via curl `-c`) for `/api/usage/*` endpoints

## Usage API — Aggregation Lag

### The problem
`/api/usage/meta`, `/api/usage/chart`, `/api/usage/stats` return 500 or
`{"error":"Failed to fetch overview data"}` when `usageDaily` table has no entry
for the current date.

### Root cause
- `usageHistory` stores individual API requests
- `usageDaily` stores daily aggregated summaries
- A background aggregation job populates `usageDaily` from `usageHistory`
- After service restart or migration, the aggregation job may not trigger automatically
- `usageDaily.data` for today can be empty/null

### Debugging
```python
import sqlite3, json
db = "/home/saturia/.extremerouter/db/data.sqlite"
c = sqlite3.connect(db)
c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
row = c.execute("SELECT date, data FROM usageDaily WHERE date=date('now')").fetchone()
if not row or not row[1]:
    print("AGGREGATION LAG: usageDaily empty for today")
count = c.execute("SELECT COUNT(*) FROM usageHistory WHERE date(date) = date('now')").fetchone()[0]
print(f"usageHistory has {count} requests today")
c.close()
```

### Fix
1. Restart the service to trigger the aggregation worker:
   ```bash
   sudo systemctl restart extremerouter.service
   ```
2. Wait 30-60 seconds for the aggregation cron to run
3. If still failing, manually backfill via SQL or trigger the aggregation endpoint
4. Check ExtremeRouter logs: `journalctl -u extremerouter.service -n 50`

### Notes
- DB path: `~/.extremerouter/db/data.sqlite` (SQLite, WAL mode)
- Use `python3` with `sqlite3` module — `sqlite3` CLI is NOT installed
- Always run `PRAGMA wal_checkpoint(TRUNCATE)` before read/write

## Key Files
| Path | Purpose |
|---|---|
| `~/.extremerouter/db/data.sqlite` | SQLite database (usageHistory, usageDaily, requestDetails) |
| `~/.extremerouter/auth/cli-secret` | CLI auth secret |
| `~/.extremerouter/machine-id` | Machine identifier for token generation |
| `~/.extremerouter/jwt-secret` | JWT signing secret |
| `~/.extremerouter/model-catalog.json` | Provider model catalog |
| `/etc/systemd/system/extremerouter.service` | systemd unit |
| `/home/saturia/.local/lib/node_modules/@rsalmn/extremerouter/` | Installed package |

## Cloudflare Tunnel
Same tunnel as 9Router — `9router.saturia.codes` → `http://localhost:20128`.
No DNS or tunnel config changes needed after migration (same hostname).
The tunnel is remotely-managed (config pushed from Cloudflare API), so hostnames
must be added via dashboard if new subdomains are needed.

## Pitfalls
- **`npm install -g` uses different node than systemd** — always use absolute node path in ExecStart
- **`sqlite3` CLI not available** — use python3's `sqlite3` module
- **WAL mode** — always checkpoint before DB operations
- **Aggregation lag** — usage API fails until aggregation job runs; restart service if needed
- **Node not in PATH** — symlink `/usr/local/bin/node` → `/home/saturia/.hermes/node/bin/node`
- **Session cookies** — dashboard uses browser sessions, not Bearer tokens; curl needs `-c` for cookies
- **Dashboard CSRF** — login page may have no CSRF token; direct POST to `/api/auth/login` works
- **Disk space** — ExtremeRouter node_modules + build artifacts can be large; check `df -h /` before `npm install -g`
