# WhatsApp interactive message types (Baileys, verified)

Verified against this bot's `lib/helper.js` Button/ButtonV2/Carousel classes (Baileys 7.0.0-rc14)
and current Meta/Baileys fork docs (Aug 2026). Use these when adding buttons/cards to a selfbot.

## Button types (name field in native_flow buttons)
| name | purpose | renders on personal num? |
|------|---------|--------------------------|
| `quick_reply` | instant reply, `display_text`+`id` | yes |
| `cta_url` | open link, `display_text`+`url`+`webview_interaction` | yes |
| `cta_copy` | copy code/text, `display_text`+`copy_code` | yes |
| `single_select` | dropdown/list, `title`+`sections[].rows[]` | yes |
| `cta_call` | call a number | often NO (Business only) |
| `cta_reminder` / `cta_cancel_reminder` | set/cancel reminder | often NO (Business only) |
| `address_message` | request address | often NO (Business only) |
| `send_location` | share location | yes |
| `call_permission_request` | request call permission (VOIP) | fork-only |

## native_flow params (messageParamsJson top-level)
- `limited_time_offer`: `{ text, url, copy_code, expiration_time }` — countdown offer card (2025/26).
- `bottom_sheet`: `{ in_thread_buttons_limit, divider_indices, list_title, button_title }`.
- `tap_target_configuration`: `{ title, description, canonical_url, domain, button_index }` — anti-phishing tap target.

## Carousel
`Carousel` class (lib/helper.js) — `addCard({ image/url, body, footer, nativeFlow[] })`, up to 10
cards, each with its own cta. Good for product/feature showcases.

## Builder usage (from lib/helper.js)
```js
const { Button, Carousel } = require("../lib/helper");
const b = new Button(sock);
b.setImage(url).setBody("Hai").addReply("OK", "ok_id").addUrl("Web", "https://x.com");
await b.send(jid, { quoted: m });
```

## Caveats
- `cta_call` / `address_message` / `cta_reminder` frequently only render on verified Business numbers.
  On a personal selfbot they may silently not appear — test on the user's real number first.
- `single_select` + `sections` is the stable replacement for the deprecated `list` message type.
- Buttons in a `buttonsMessage` are capped at 3 reply buttons; native_flow supports more via sections.
