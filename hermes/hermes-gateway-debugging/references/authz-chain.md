# Hermes Gateway Authorization Chain (reference)

Source of truth: `~/.hermes/hermes-agent/gateway/authz_mixin.py` →
`_is_user_authorized(source)`. The gateway calls this on every inbound message
before dispatch. If it returns False, the message is dropped (DMs from an
authorized platform may be offered a pairing code instead).

## Per-platform "allowed users" env var

| Platform | Allowed-users env | Allow-all env |
|---|---|---|
| telegram | `TELEGRAM_ALLOWED_USERS` | `TELEGRAM_ALLOW_ALL_USERS` |
| discord | `DISCORD_ALLOWED_USERS` | `DISCORD_ALLOW_ALL_USERS` |
| whatsapp | `WHATSAPP_ALLOWED_USERS` | `WHATSAPP_ALLOW_ALL_USERS` |
| whatsapp_cloud | `WHATSAPP_CLOUD_ALLOWED_USERS` | `WHATSAPP_CLOUD_ALLOW_ALL_USERS` |
| slack | `SLACK_ALLOWED_USERS` | `SLACK_ALLOW_ALL_USERS` |
| signal | `SIGNAL_ALLOWED_USERS` | `SIGNAL_ALLOW_ALL_USERS` |
| email | `EMAIL_ALLOWED_USERS` | `EMAIL_ALLOW_ALL_USERS` |
| sms | `SMS_ALLOWED_USERS` | `SMS_ALLOW_ALL_USERS` |
| mattermost | `MATTERMOST_ALLOWED_USERS` | `MATTERMOST_ALLOW_ALL_USERS` |
| matrix | `MATRIX_ALLOWED_USERS` | `MATRIX_ALLOW_ALL_USERS` |
| dingtalk | `DINGTALK_ALLOWED_USERS` | `DINGTALK_ALLOW_ALL_USERS` |
| feishu | `FEISHU_ALLOWED_USERS` | `FEISHU_ALLOW_ALL_USERS` |
| wecom | `WECOM_ALLOWED_USERS` | `WECOM_ALLOW_ALL_USERS` |
| wecom_callback | `WECOM_CALLBACK_ALLOWED_USERS` | `WECOM_CALLBACK_ALLOW_ALL_USERS` |
| weixin | `WEIXIN_ALLOWED_USERS` | `WEIXIN_ALLOW_ALL_USERS` |
| bluebubbles | `BLUEBUBBLES_ALLOWED_USERS` | `BLUEBUBBLES_ALLOW_ALL_USERS` |
| qqbot | `QQ_ALLOWED_USERS` | `QQ_ALLOW_ALL_USERS` |
| yuanbao | `YUANBAO_ALLOWED_USERS` | `YUANBAO_ALLOW_ALL_USERS` |

Global override (any platform): `GATEWAY_ALLOWED_USERS` (comma-separated) and
`GATEWAY_ALLOW_ALL_USERS=true` (allow everyone).

Group-scoped extras: `TELEGRAM_GROUP_ALLOWED_USERS`,
`TELEGRAM_GROUP_ALLOWED_CHATS`, `QQ_GROUP_ALLOWED_USERS`.

Value format: comma-separated IDs; a `*` in the list means allow everyone.

## Annotated check order (as coded)

1. **Always-authorized platforms** — `HOMEASSISTANT`, `WEBHOOK` return True
   (system/authenticated upstream).
2. **Upstream-relay delegation** — if `source.delivered_via_upstream_relay is
   True` or the adapter declares `authorization_is_upstream` (real bool `is
   True`, not truthy), return True. This is delegation to a trusted upstream,
   not a fail-open.
3. **Chat-scoped allowlist** (group/forum/channel only) — env
   `TELEGRAM_GROUP_ALLOWED_CHATS` / `QQ_GROUP_ALLOWED_USERS`, plus the adapter
   config `extra.group_allowed_chats`. `*` or matching chat id → True.
4. **Bots** — `{PLATFORM}_ALLOW_BOTS` set to `mentions`/`all` (e.g.
   `DISCORD_ALLOW_BOTS`) authorizes bot senders.
5. **No user id** → return False (after the chat-scoped checks above).
6. **Per-platform allow-all** — `{PLATFORM}_ALLOW_ALL_USERS=true` → True.
7. **Adapter role auth** — `source.role_authorized is True` (Discord confirmed
   the user holds a role in `DISCORD_ALLOWED_ROLES` before dispatch) → True.
8. **Pairing store** — `PairingStore.is_approved(platform, user_id)` reads
   `~/.hermes/platforms/pairing/<platform>-approved.json` from **disk every
   call** (no in-memory cache) → True if present.
9. **Allowlist unions** — gather `platform_allowlist` (from step-2 env var),
   `group_user_allowlist`, `global_allowlist`; if `*` present → True; else
   compare `user_id` (and its `@`-split / WhatsApp-alias variants) against the
   set.
10. **No allowlist configured at all** → consult adapter-owned policy
    (`dm_policy`/`group_policy` = `allowlist`) and `GATEWAY_ALLOW_ALL_USERS`.
    Default: **deny**.

## Key takeaways for debugging

- The pairing store (step 8) is the only path that is **hot** — it is read from
  disk on every message, so editing `<platform>-approved.json` authorizes
  immediately with no restart.
- Env-var allowlists (steps 2/6/9) are read via `agent.secret_scope.get_secret`
  → falls back to `os.environ`. They are captured into process env at gateway
  **startup**; `.env` edits while running do nothing until restart.
- The running process's *actual* env is the source of truth, not the on-disk
  `.env`. Inspect it with
  `tr '\0' '\n' < /proc/<PID>/environ | grep -i DISCORD_ALLOWED_USERS`.
