# Scripting the dashboard API: force model-catalog refresh

The Models-page picker caches each provider's model list on disk for **1h**.
To force a live re-fetch (new models appeared upstream, picker list stale):

    GET /api/model/options?refresh=true

`refresh=true` busts the per-provider model-id disk cache so every provider
row re-probes its live catalog. Normal opens leave it false and stay on the
1h cache. Source: `hermes_cli/web_server.py` (`get_model_options`).

## Scripting from the CLI (basic-auth dashboard, e.g. agent.satzz.online)

Cookie-jar login works locally — no need to extract the session token:

```bash
curl -sS -c /tmp/cj -o /dev/null -w "login -> %{http_code}\n" \
  -X POST -H 'Content-Type: application/json' \
  -d '{"provider":"basic","username":"admin","password":"<PW>","next":"/"}' \
  http://127.0.0.1:9119/auth/password-login          # → 200

curl -sS -b /tmp/cj "http://127.0.0.1:9119/api/model/options?refresh=true"
```

Response shape: `{providers: [{name, models: [...]}, ...], model, provider}`.

Alternative auth: `X-Hermes-Session-Token` header — the token is injected
into the SPA HTML at startup (`window.__HERMES_SESSION_TOKEN__`) and rotates
on every server restart.

## Sibling endpoints (same auth)

- `GET /api/model/info` — current main model
- `GET /api/model/auxiliary` — main + all auxiliary assignments
- `POST /api/model/set` — set main or aux slot
  (`{"scope":"main","provider":...,"model":...}` or
  `{"scope":"auxiliary","task":"vision",...}`; `task:"__reset__"` resets all aux to auto)
- `GET /api/model/recommended-default`

Verified 2026-08-22 on this host: refresh returned 10 providers with fresh
model counts (Nous Portal 38, OpenRouter 41, 9Router 117, Custom 117, ...).
