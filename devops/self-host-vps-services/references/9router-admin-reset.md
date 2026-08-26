# 9Router admin password reset (forgotten password recovery)

Verified working path on the saturia VPS (9Router v0.5.55, systemd unit
`9router.service`, runs `/home/saturia/.local/lib/node_modules/9router/app/custom-server.js`).

## What is NOT true (don't waste time)
- There is **no `9router --reset-password`** CLI command.
- There is **no live default password** once a hash is stored. The "default `123456`"
  only applies when `settings.data.password` is null/empty (fresh first-run owner setup).
  After the first login set a password, that path is gone.
- Reading the minified Next build (`app/.next-cli-build/...`) to find a CLI was wasted effort.

## Facts that ARE true
- Password lives in sqlite: `/home/saturia/.9router/db/data.sqlite`
  (WAL mode — sibling `.sqlite-wal`/`.sqlite-shm`).
- Table `settings`, single row `id=1`, column `data` = a JSON string.
  Field `data.password` = bcrypt hash, e.g. `$2b$10$…` (10 rounds, 60 chars).
- Verification in the app uses standard **bcryptjs `compareSync`**, so ANY bcryptjs hash
  you generate with 10 rounds will be accepted.
- `sqlite3` CLI is NOT installed. Use `python3` (has `sqlite3`) — but you MUST run
  `PRAGMA wal_checkpoint(TRUNCATE)` before reading/writing, or you'll see stale/empty
  tables (WAL not flushed).
- A standalone `bcryptjs` copy exists at `/tmp/bcryptgen/node_modules/bcryptjs` (no
  bcryptjs in 9router's own `node_modules`). Use that to hash, or `npm i bcryptjs`
  anywhere. `require('bcryptjs').hashSync(pw, 10)` → 60-char `$2b$10$…` hash.

## Reset procedure
1. Pick the new password. Generate its hash:
   ```bash
   node -e "const b=require('/tmp/bcryptgen/node_modules/bcryptjs'); \
     console.log(b.hashSync(process.argv[1], 10))" 'NEW_PASSWORD_HERE'
   ```
   (verify length === 60 and `b.compareSync('NEW_PASSWORD_HERE', hash) === true`.)

2. Overwrite the hash in the DB (python3, WAL-aware):
   ```python
   import sqlite3, json
   DB='/home/saturia/.9router/db/data.sqlite'
   c=sqlite3.connect(DB)
   c.execute("PRAGMA wal_checkpoint(TRUNCATE)"); c.commit()
   row=c.execute("SELECT data FROM settings WHERE id=1").fetchone()[0]
   d=json.loads(row); d['password']='<HASH_FROM_STEP_1>'
   c.execute("UPDATE settings SET data=? WHERE id=1", (json.dumps(d),))
   c.commit(); c.close()
   ```

3. Restart the service (user-owned systemd unit, owned by `saturia`):
   ```bash
   sudo systemctl restart 9router.service
   ```
   Service auto-recovers (`Restart=on-failure`, `RestartSec=5`). ~5s downtime.

4. Log in at `https://<9router-subdomain>.saturia.codes` with the new password.
   (UI at `/` → owner login; first run after null password is owner setup, but once a
   hash exists it's a normal login.)

## Notes
- Only the `password` field is touched; everything else in `settings.data`
  (`capacityAdapter`, model lists, etc.) is preserved.
- No need to stop the service before editing — restart flushes cleanly.
- If you ever want to nuke to first-run owner setup instead, set `data.password`
  to `null`/empty string rather than a hash.
