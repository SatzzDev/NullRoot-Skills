---
name: 9router-admin-password-reset
description: Reset 9Router admin password when locked out of dashboard.
version: 1.0.0
author: NullRoot
---

# 9Router Admin Password Reset

9Router stores a single owner/admin password in its SQLite DB. There is NO
separate `users` table — the admin is the owner row inside the `settings` blob.

## Key facts
- DB: `/home/saturia/.9router/db/data.sqlite` (WAL mode).
  Always run `PRAGMA wal_checkpoint(TRUNCATE)` before read/write, else
  `SELECT name FROM sqlite_master` returns an empty table list.
- Password lives in `settings` table, `data` column (JSON) at key `password`.
  Format: bcrypt `$2b$10$...` (60 chars).
- `sqlite3` CLI is NOT installed. Use `python3` (has the sqlite3 module).
- bcrypt is bundled inside the Next build (pure-JS bcryptjs, chunk `2391.js`),
  NOT require-able from the app node_modules tree. A standalone `bcryptjs`
  exists at `/tmp/bcryptgen/node_modules/bcryptjs` — hash with that.
- Service: `9router.service` (in `/etc/systemd/system`, `User=saturia`).
  It is a SYSTEM service, so restart needs root: `sudo systemctl restart 9router`.
  ~5s downtime, `Restart=on-failure`.

## Reset procedure
1. Hash the new password (replace NEWPASS):
   ```bash
   node -e "const b=require('/tmp/bcryptgen/node_modules/bcryptjs');console.log(b.hashSync('NEWPASS',10))"
   ```
   Verify the output is 60 chars and `b.compareSync('NEWPASS', hash)` is true.

2. Write it back into the JSON `data` blob (python3):
   ```python
   import sqlite3, json
   db = "/home/saturia/.9router/db/data.sqlite"
   c = sqlite3.connect(db)
   c.execute("PRAGMA wal_checkpoint(TRUNCATE)"); c.commit()
   cur = c.cursor()
   cur.execute("SELECT id, data FROM settings WHERE id=1")
   rid, data = cur.fetchone()
   d = json.loads(data)
   d["password"] = "<HASH_FROM_STEP_1>"
   cur.execute("UPDATE settings SET data=? WHERE id=?", (json.dumps(d), rid))
   c.commit(); c.close()
   ```

3. Restart the service:
   ```bash
   sudo systemctl restart 9router
   ```

4. Log in to the 9router dashboard with the new password.

## Gotchas
- Don't edit the DB while the service holds the WAL — checkpoint first.
  If you hit a locking/write error, stop the service (`sudo systemctl stop 9router`),
  write, then start it again.
- The service file sets
  `NODE_PATH=...9router/app/node_modules:...9router/node_modules` — bcryptjs is
  in NEITHER, which is why the `/tmp/bcryptgen` standalone is used to hash.
- `/home/saturia/.9router/auth/cli-secret` is a SEPARATE hex token for CLI auth,
  NOT the admin dashboard login password. Don't confuse the two.
- Only the `password` field in `settings.data` is changed. Leave everything else
  (capacityAdapter, models, etc.) untouched.
