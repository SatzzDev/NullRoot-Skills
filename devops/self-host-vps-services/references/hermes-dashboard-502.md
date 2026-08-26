# Hermes dashboard 502 on saturia VPS

`agent.satzz.online` is the Hermes **dashboard** web UI (port 9119), not the agent engine.
Engine is local-only (Discord/Telegram gateway). Dashboard is the public domain.

Full recipe lives in skill `expose-hermes-dashboard-tunnel` →
`references/saturia-vps-dashboard-502.md`. Short version:

- 502 + CF IPs resolving = origin down, not DNS.
- Unit: `systemctl --user` `hermes-dashboard.service` (not sudo/system).
- Crash-loop: `Refusing to bind dashboard to 0.0.0.0 — no auth providers registered`.
- `is-active` can still say `active` while restart counter is in the thousands. Check
  `ss -ltn | grep 9119` + journal.
- Fix: hash with venv python `plugins.dashboard_auth.basic.hash_password`, then
  `hermes config set dashboard.basic_auth.username` / `password_hash`. Never
  `patch`/`write_file` on `~/.hermes/config.yaml`.
- Domains: `agent.satzz.online` is live. `agent.saturia.codes` and
  `agent.saturia.online` have **no DNS**.
