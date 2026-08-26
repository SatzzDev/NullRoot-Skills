# Dashboard REST API: model catalog refresh & model endpoints

Verified against this host's dashboard (0.0.0.0:9119, basic auth,
`hermes-dashboard.service`). Source of truth: `hermes_cli/web_server.py`.

## Refresh the model picker catalog

The Models page picker caches each provider's model list on disk for 1h.
To force a live re-fetch (provider added models, list looks stale):

```bash
# 1. log in through the basic-auth gate, keep the cookie jar
curl -sS -c /tmp/cj -o /dev/null -w "login -> %{http_code}\n" \
  -X POST -H 'Content-Type: application/json' \
  -d '{"provider":"basic","username":"admin","password":"<PW>","next":"/"}' \
  http://127.0.0.1:9119/auth/password-login          # -> 200

# 2. bust the cache and re-fetch every provider's live catalog
curl -sS -b /tmp/cj "http://127.0.0.1:9119/api/model/options?refresh=true"
```

Response shape: `{"providers":[{"name":..., "models":[...]}, ...],
"model":..., "provider":...}` — the exact payload the picker renders.
`refresh=true` busts the per-provider model-id disk cache; normal opens
stay on the 1h cache. No dashboard/gateway restart needed — the Models
page shows the fresh list on next open.

## Related model endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/model/info` | current main model |
| `GET /api/model/options` | providers + curated model lists (`?refresh=true`, `?include_unconfigured=true`, `?explicit_only=true`) |
| `GET /api/model/auxiliary` | aux slot assignments |
| `GET /api/model/recommended-default` | suggested default |
| `POST /api/model/set` | `{"scope":"main"\|"auxiliary","task","provider","model"}` — writes config.yaml |

## Auth for API calls

Either works:
- Cookie from `/auth/password-login` (as above).
- `X-Hermes-Session-Token: <token>` header — the token is injected into
  the SPA HTML as `window.__HERMES_SESSION_TOKEN__` and ROTATES on every
  dashboard restart, so re-grab it after restarts.

## Pitfalls

- Login route is `/auth/password-login` with provider `"basic"` — NOT
  `/api/auth/login` (401). Same trap as in the main SKILL.md.
- `refresh=true` re-probes every authenticated provider's `/models` —
  can take several seconds with many providers; don't put it on a poller.
