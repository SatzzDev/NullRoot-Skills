# Wings Daemon REST API notes

Base URL: `https://<node-fqdn>:8080` (HTTPS). Auth: `Authorization: Bearer <token>` where
`<token>` is `token` from `/etc/pterodactyl/config.yml` (paired with `token_id`).

## Endpoints (per server UUID)
- `GET  /api/servers/<uuid>/state` — server state/statistics.
- `POST /api/servers/<uuid>/power` with body `{"signal":"restart|start|stop|kill"}` — power control.
- `GET  /api/servers/<uuid>/files/list-directory?directory=%2F` — list files (what the web File Manager calls).
- `GET/POST/PUT/DELETE /api/servers/<uuid>/files/*` — file read/write via the daemon.

## Gotchas
- The panel calls these over the FQDN in `config.yml` → if that FQDN resolves to a public IP that
  can't hairpin back, you get `cURL error 28: Connection timed out`. Fix with the `/etc/hosts`
  localhost mapping (see SKILL.md). The daemon side is fine — test with `curl -sk -I .../api/system`.
- Self-signed / LetsEncrypt cert: use `curl -k` (or the cert is trusted if issued by a public CA).
- Wings API calls from the panel use the `Host:` header = the node FQDN; keep that consistent.
