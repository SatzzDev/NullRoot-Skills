# Dashboard REST API — model refresh & model management

Verified against the local dashboard (basic-auth mode, port 9119), 2026-08-22.

## Auth: cookie login (terminal-friendly)

The gate uses cookie sessions. Log in once, reuse the jar:

```bash
curl -sS -c /tmp/hdash_cj -X POST -H 'Content-Type: application/json' \
  -d '{"provider":"basic","username":"admin","password":"<PW>","next":"/"}' \
  http://127.0.0.1:9119/auth/password-login    # -> 200
```

Route is `/auth/password-login` (NOT `/api/auth/login`), provider name is `"basic"` — same pitfall as main SKILL.md.

Alternative: `X-Hermes-Session-Token` header. The token is injected into the SPA HTML at startup (`window.__HERMES_SESSION_TOKEN__`) and rotates on every server restart. Cookie login is simpler from a terminal.

## Refresh the model catalog (= the "Refresh Models" button)

```bash
curl -sS -b /tmp/hdash_cj "http://127.0.0.1:9119/api/model/options?refresh=true"
```

- `refresh=true` busts the per-provider model-id disk cache (default TTL 1h) and re-fetches every authenticated provider's live catalog. This is exactly what the picker's explicit "Refresh Models" control calls (source: `get_model_options` in `hermes_cli/web_server.py`).
- Response shape: `{"providers": [...], "model": ..., "provider": ...}` — each provider entry carries its curated model list. Count models per provider to confirm the refresh landed.
- Query params: `profile=<name>` (scope to a profile), `include_unconfigured=true`, `explicit_only=true`.

## Other model endpoints (same auth)

| Endpoint | Purpose |
|---|---|
| `GET /api/model/info` | Current main model info |
| `GET /api/model/options` | Providers + curated model lists (picker data) |
| `GET /api/model/auxiliary` | Main + 11 auxiliary task assignments |
| `POST /api/model/set` | Set main or aux model. Body: `{"scope":"main"\|"auxiliary","task":"","provider":"...","model":"..."}`; `task:"__reset__"` resets all aux to auto |
| `GET /api/model/recommended-default` | Recommended default model |

`POST /api/model/set` writes `config.yaml`; takes effect on NEW sessions only — running gateway sessions keep their model until a new session / gateway restart.

## Finding more endpoints

All dashboard routes live in `hermes_cli/web_server.py` (large single file). Grep there, not across the repo:

```bash
grep -n '"/api/' ~/.hermes/hermes-agent/hermes_cli/web_server.py | grep model
```

## Verified transcript (2026-08-22)

```
login -> 200
refresh -> 200
keys: ['providers', 'model', 'provider']
- Nous Portal | models: 38
- OpenRouter | models: 41
- Mixture of Agents | models: 1
- openai-api | models: 16
- GitHub Copilot | models: 17
- xAI | models: 13
- MiniMax (minimax.io) | models: 3
- Custom endpoint | models: 117
- OpenCode Free | models: 6
- 9Router | models: 117
```
