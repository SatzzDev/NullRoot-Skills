---
name: pelican-components-v2-webhook
description: Use when Discord Components V2 needed in Pelican webhooks.
---

# Pelican Discord Webhook — Components V2

## How it works
`ProcessWebhook` (app/Jobs/ProcessWebhook.php) posts `WebhookConfiguration->endpoint` verbatim via `Http::post()`. Discord requires `?with_components=true` on the webhook URL to accept Components V2 payloads — append it in the endpoint DB column / admin form. No code change needed.

## Payload format (webhook_configurations.payload, type=discord)
```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "accent_color": 5814783,
      "components": [
        { "type": 10, "content": "### Title here" },
        { "type": 10, "content": "Event: {{ event }}" }
      ]
    }
  ]
}
```
- `flags: 32768` = IS_COMPONENTS_V2 flag (required, exact value)
- container = type 17, text display = type 10
`{{ event }}` plus flattened vars injected by `enrichData()` in ProcessWebhook: `{{ color }}`, `{{ server_id }}`, `{{ server_name }}` (data.id → subjects → DB lookup), `{{ actor_username }}`, `{{ description }}`, `{{ ip }}`, `{{ timestamp }}`. Missing vars resolve to '' — never leak literal key names. Note: fake server ids in tests leave server_name empty; real events resolve via DB lookup.

## Per-event accent color: `{{ color }}`
Patch in `ProcessWebhook` adds `$data['color']` resolved from event name via `eventColor()` map (green=power start/restart, red=power stop/kill/file delete, yellow=backup start/restore, purple=backup, blue=file/upload/pull, teal=database, orange=schedule/task, gray=subuser, blurple=default). Use `"accent_color": "{{ color }}"` in payload. An `array_walk_recursive` cast turns the numeric string into int for Discord.

## Deploy rule (learned the hard way)
After editing any job class, restart the queue worker daemon or old code keeps running:
```bash
sudo systemctl restart pelican.service
```

## Caveat: embeds guard
`ProcessWebhook` clears bit 2 of `flags` when `embeds` present (`$data['flags'] &= ~(1 << 2)`). Don't mix `embeds` with a V2 payload — V2 messages reject embeds/content and the guard would corrupt the flag.

## Apply + test
```bash
# edit config via admin UI, or tinker as www-data:
sudo -u www-data env HOME=/tmp php /var/www/pelican/artisan tinker
# then: $w = WebhookConfiguration::find(ID); $w->payload = [...]; $w->endpoint .= '?with_components=true'; $w->save(); $w->run();
```
`$w->run()` dispatches a test with sample data. Queue worker (`pelican.service`) processes it; verify via `webhooks.successful_at` (NULL = Discord rejected) and actual Discord channel.

## Verify
```bash
mysql -u saturia -p3551 pelican -e "SELECT id, event, successful_at FROM webhooks ORDER BY id DESC LIMIT 3;"
```