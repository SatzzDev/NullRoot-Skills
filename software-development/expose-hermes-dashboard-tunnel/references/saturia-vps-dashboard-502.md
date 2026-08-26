# saturia VPS — Hermes dashboard 502 (`agent.satzz.online`)

Host: Azure Linux box, user `saturia`. Tunnel `a9521ff9-c74b-422a-a900-6fee7294aa2a`,
config `/etc/cloudflared/config.yml` (root `cloudflared.service`). Dashboard unit is
**user systemd**, not system:

`/home/saturia/.config/systemd/user/hermes-dashboard.service`
→ `python -m hermes_cli.main dashboard --host 0.0.0.0 --port 9119 --no-open`
`HERMES_HOME=/home/saturia/.hermes`

Ingress already maps `agent.satzz.online` → `http://localhost:9119`.

## Symptom

Cloudflare 502 on `https://agent.satzz.online/`. Tunnel resolves (CF IPs). Port 9119 is **not
listening**. `systemctl --user status hermes-dashboard` shows `active (running)` for ~1s then
restarts; restart counter in the thousands.

## Root cause

Journal:

```
Refusing to bind dashboard to 0.0.0.0 — the auth gate engages on non-loopback binds,
but no auth providers are registered.
```

`dashboard.basic_auth` missing from `~/.hermes/config.yaml`. Fail-closed on public bind.

## Fix (verified)

1. Hash with the **venv** python (not system python — plugin import lives there):

   ```bash
   /home/saturia/.hermes/hermes-agent/venv/bin/python -c \
     "from plugins.dashboard_auth.basic import hash_password; print(hash_password('THE_PASSWORD'))"
   ```

2. Write config via CLI (edit tools refuse `config.yaml`):

   ```bash
   /home/saturia/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main \
     config set dashboard.basic_auth.username admin
   /home/saturia/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main \
     config set dashboard.basic_auth.password_hash 'scrypt$...'
   ```

3. Restart **user** unit (not `sudo systemctl`):

   ```bash
   systemctl --user restart hermes-dashboard.service
   ```

4. Verify: `ss -ltn | grep 9119` shows `0.0.0.0:9119`; journal has `HERMES_DASHBOARD_READY port=9119`;
   `curl -s -o /dev/null -w '%{http_code}\n' https://agent.satzz.online/` → `302` (login redirect).

Store generated creds at `~/.hermes/dashboard-creds.txt` chmod 600. Do not put the password in
skills or memory.

## Domain facts (don't mix)

| Hostname | Status |
|---|---|
| `agent.satzz.online` | live dashboard (this tunnel, port 9119) |
| `9router.saturia.codes` | 9Router (20128) |
| `api.saturia.codes` | app on 4000 |
| `agent.saturia.codes` | **no DNS** |
| `agent.saturia.online` | **no DNS** (typo of the above / of satzz.online) |

Hermes **engine** (Discord/Telegram gateway) is local-only. The public domain is only the
**dashboard** web UI.

## Pitfalls

- `active (running)` with a climbing restart counter is still a crash-loop — check `ss` + journal,
  not just `is-active`.
- `sudo systemctl restart hermes-dashboard` does nothing; the unit is `--user`.
- Binding `127.0.0.1` to dodge the auth gate would publish an unauthenticated dashboard through
  the tunnel. Always `0.0.0.0` + basic_auth.
