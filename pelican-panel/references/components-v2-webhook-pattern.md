# Components V2 Webhook Pattern — Pelican Panel

## Summary

Send Discord Components V2 messages from Pelican's built-in webhook system (no discord.js). Tested 2026-09-03.

## How it works

`ProcessWebhook` (app/Jobs/ProcessWebhook.php) posts `WebhookConfiguration->endpoint` verbatim via `Http::post()`.

## Required endpoint query param

Discord webhook URLs require `?with_components=true` to accept V2 payloads. Without it, Discord ignores `components` and treats the JSON as a regular webhook message. Append to the DB endpoint column:

```php
$w->endpoint .= (str_contains($w->endpoint, '?') ? '&' : '?') . 'with_components=true';
```

## Payload template

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "accent_color": "{{ color }}",
      "components": [
        { "type": 10, "content": "### {{ event }}" },
        { "type": 10, "content": "{{ description }}" },
        { "type": 10, "content": "**Server:** {{ server_name }} (`{{ server_id }}`)\n**Actor:** {{ actor_username }}\n**IP:** {{ ip }}\n**Time:** {{ timestamp }}" }
      ]
    }
  ]
}
```

## Template variables (enriched by `enrichData()` in ProcessWebhook)

| var | source | example |
|---|---|---|
| `{{ event }}` | event name | server:power.start |
| `{{ color }}` | eventColor map (int) | 5763719 |
| `{{ server_id }}` | data.id to subjects to DB | 4 |
| `{{ server_name }}` | data.name to DB lookup | MC Survival |
| `{{ actor_username }}` | actor.username / user.username | saturia |
| `{{ description }}` | activity log description | Powered up the server |
| `{{ ip }}` | activity log ip | 203.0.113.10 |
| `{{ timestamp }}` | activity log timestamp | 2026-08-30T20:47:12+00:00 |

Missing vars resolve to `''` — never leak the literal `{{ var }}` key name.

## Per-event accent color map

| event family | color | hex |
|---|---|---|
| power.start, power.restart | green | 5763719 |
| power.stop, power.kill, file.delete | red | 15548997 |
| backup.start, backup.restore | yellow | 16705372 |
| backup (other) | purple | 10181046 |
| file, upload, pull | blue | 3447003 |
| database | teal | 5793266 |
| schedule, task | orange | 15108450 |
| subuser | gray | 9807270 |
| default | blurple | 5814783 |

## Critical deploy rule

After editing `ProcessWebhook.php`, **always** run `sudo systemctl restart pelican.service`. The queue worker caches the old compiled class in memory and will NOT pick up new code otherwise. This is NOT theoretical — a test in 2026-09-03 showed `accent_color` stuck as literal `"color"` for 3+ cycles until the unit was restarted.

## Embeds guard

`ProcessWebhook` clears bit 2 of `flags` when `embeds` present (`$data['flags'] &= ~(1 << 2)`). Do NOT mix `embeds` with a V2 payload — V2 messages reject embeds/content and the guard corrupts the flag.

## Verification

```bash
mysql -u saturia -p3551 pelican -e "SELECT id, event, successful_at, LEFT(payload,120) AS p FROM webhooks ORDER BY id DESC LIMIT 3;"
```
`successful_at` populated = Discord accepted. NULL = rejected (check `?with_components=true` and payload shape).

## Real-world test results

Tested 2026-09-03 with three event shapes:
- `server:power.start` (activity log, actor+subjects) → green, server_id=4 resolved from subjects, actor=saturia
- `eloquent.updated: App\Models\Server` (model event, data.*) → blurple, server_name=MC Survival resolved from data.name via DB lookup
- `server:file.write` (sparse, no server context) → blue, empty vars resolved to `''` — no leaked `{{ }}` literals

All three delivered successfully (`successful_at` set).
