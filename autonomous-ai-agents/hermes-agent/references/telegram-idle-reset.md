# Telegram Session Idle Auto-Reset Pattern

**Problem**: You want to auto-run `/new` (or start a fresh session) in a Telegram chat
after N minutes of inactivity, *without* clashing with the Hermes gateway's own
long-poll webhook loop.

## Why not poll `getUpdates` directly?

Calling `api.telegram.org/bot<TOKEN>/getUpdates` from a cron watchdog while the
gateway is *also* long-polling the same token returns **HTTP 409 Conflict**.

## The right way: read Hermes' own session store (`state.db`)

Hermes already records `last_activity_at` for every platform session inside the
canonical SQLite store at `~/.hermes/state.db`. Reading that is:

- free (no API quota / rate-limit risk),
- authoritative (same timestamp the UI shows),
- safe (the gateway owns the Bot token; you don't touch it).

## Query you need

```sql
SELECT last_activity_at
FROM sessions
WHERE source='telegram'
  AND last_activity_at IS NOT NULL
  AND ended_at IS NULL           -- still-open sessions only
ORDER BY last_activity_at DESC
LIMIT 1;
```

The value is a **double epoch with fractional seconds** (e.g.
`1786948856.33542`). Convert with `printf "%.0f"` or `date -d @` before doing
integer math.

## Putting it together in a Cron-style Script

1. `sqlite3` must be installed (`apt-get install -y sqlite3`).
2. Threshold = idle seconds (e.g. `1800` for 30 minutes). Use `now – last_activity`.
3. If over threshold, call `hermes chat -q "/new"` — this re-enters the active
   Telegram session (the gateway treats it as a new user turn on the existing chat ID).
4. `deliver` stays `origin` (back to the same chat) or explicit `telegram:CHAT_ID`.

### Common pitfalls

| Pitfall | Cause | Fix |
|---|---|---|
| `jq: error … null` | Token was wrong → API returned `.ok=false` | Treat `.ok == true` as a hard gate before reading results |
| `integer expression expected` | `last_activity_at` has decimals | Wrap with `printf "%.0f"` |
| HTTP 409 from getUpdates | Gateway owns token polling | Never call Bot API inside cron; read `state.db` instead |

## Delivery targeting notes

- `deliver: "origin"` → back to the chat that the *cron job* last received from,
  but since cron jobs have no user present, it resolves to the agent's home Telegram chat (config `telegram.home_chat`).
- For a *specific* chat: set `deliver: "telegram:<chat_id>"` explicitly when
  creating the cron job.
- To send to **multiple chats**, create one cron job per target.
