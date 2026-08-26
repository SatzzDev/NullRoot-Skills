# 9Router internals (v0.5.55, verified by reading src on GitHub)

## Run modes
- `cli.js` = interactive launcher. Spawns `app/custom-server.js` (Next.js) then shows a TUI menu and
  **exits**. Unsuitable for systemd `ExecStart` (child gets SIGKILL on parent exit).
- Correct systemd entry: `/home/saturia/.hermes/node/bin/node
  /home/saturia/.local/lib/node_modules/9router/app/custom-server.js` with `PORT`+`HOSTNAME` env.
  It reads `PORT`/`HOSTNAME` and serves Next.js 16 on 0.0.0.0:20128. Uses `node:sqlite` fallback
  (better-sqlite3 optional) → DB at `~/.9router/db/data.sqlite`.

## Web password
- Stored in `settings` table (`id=1`), column `data` is JSON with a `password` field holding a
  **bcrypt hash** (`bcryptjs`, cost 10). Source: `src/app/api/auth/login/route.js`.
- When `settings.password` is `null` → default password is `123456` (or `INITIAL_PASSWORD` env).
- `POST /api/auth/reset-password` (local-only, needs `x-9r-cli-token` header) just sets
  `password: null` → back to default `123456`. It does NOT let you set an arbitrary password remotely.
- To set a custom password programmatically: `bcrypt.hashSync(pw,10)` then
  `UPDATE settings SET data = json_set(data,'$.password',?) WHERE id=1`.
- First remote login with the default `123456` returns 403 `mustChangePassword` (app security
  trade-off) — change it from the local machine or set `INITIAL_PASSWORD` before launch.

## CLI token (for local-only admin endpoints)
```
deviceId   = trim(readFileSync('~/.9router/machine-id'))
cliSecret  = trim(readFileSync('~/.9router/auth/cli-secret'))
token = sha256(deviceId + "9r-cli-auth" + cliSecret).digest("hex").substring(0,16)
```
Used as `x-9r-cli-token` header.

## Endpoints
- OpenAI-compatible: `https://9router.saturia.codes/v1`
- Dashboard/login: `https://9router.saturia.codes/login` → `/dashboard`
