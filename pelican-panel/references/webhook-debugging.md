# Discord Webhook Debugging

## Error Symptoms
- Webhook test fails in panel with "Column 'payload' cannot be null" SQL error.
- `webhooks` table rows show `payload = {"event":"server:file.write"}` and `successful_at = NULL`.
- Discord never receives the message.

## Root Cause Chain
1. `webhook_configurations.payload` column is `NULL` for the Discord webhook config.
2. `json_encode(NULL)` → `'null'`.
3. `replaceVars()` returns `'null'` (no replacement).
4. `json_decode('null', true)` → `null`.
5. Guard in `ProcessWebhook` converts `null` to `[]`.
6. `$data['event']` assigned → payload becomes `{"event":"server:file.write"}`.
7. Discord API requires `content` or `embeds`; returns 400 Bad Request.
8. `Http::post()` throws exception, `successful_at` set to `null`, but `create()` still runs with the incomplete payload.
9. Job completes without error (exception caught), but the webhook never fires.

## Fixes

### 1. Set a valid payload template
Go to Pelican admin → Webhook Configurations → id=2 → set `payload` with a valid Discord message structure:

```json
{
  "content": "Event {{event}} occurred on server {{server.name}}"
}
```

### 2. Patch ProcessWebhook to guard null decode (already applied)
Adds `if (!is_array($data)) { $data = []; }` after `json_decode`.

### 3. Manual job processing (if worker not running)
```bash
sudo -u www-data php /var/www/pelican/artisan queue:work --once --tries=3
```
Run repeatedly until `jobs` table empty.

### 4. Verify
- Check `webhooks.successful_at` — if `NULL`, Discord rejected the POST.
- Check Discord channel for actual message delivery.

## Discord Components V2 (rich messages via webhook)

Discord webhooks support Components V2 (interactive message containers: headings, separators, buttons, button accessories, media galleries) — but only if the webhook URL ends with `?with_components=true`. Without it the API ignores/rejects the `components` field. There is no separate JSON body flag; it's purely the URL query param.

Payload shape (webhook POST body):

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "accent_color": 5814783,
      "components": [
        { "type": 10, "content": "### What is this?" },
        { "type": 10, "content": "**Bold section**\n\nPlain markdown body." }
      ]
    }
  ]
}
```

- `type: 17` = container (can hold nested content + separators/buttons/accessories).
- `accent_color` is an int: 0x58BFFF = 5814783.
- `type: 10` = content block; markdown supported in `content`.
- `flags: 32768` = `IS_COMPONENTS_V2` message flag.
- Classic `content`/`embeds` still work independently alongside components.
- Design preference (Saturia): webhook configs should ONLY override the webhook profile (avatar + username); message structure/formatting lives in the `webhook_configurations.payload` template, so component templates belong there too.

## Relevant Commands
```bash
# Check pending jobs
mysql -u saturia -p3551 pelican -e "SELECT id, payload, successful_at FROM webhooks ORDER BY id DESC LIMIT 5;"

# Check failed jobs
mysql -u saturia -p3551 pelican -e "SELECT COUNT(*) FROM failed_jobs;"

# Run worker once
sudo -u www-data php /var/www/pelican/artisan queue:work --once --tries=3
```