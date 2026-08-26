# Discord Components V2 — Component JSON Reference

Full field structure for every component `type` in raw JSON form. Send these directly in `components:` — discord.js accepts plain objects, no builder classes required.

---

## Text Display — `type: 10`

Renders markdown text. Replaces `embed.description` and the message `content` field.

```js
{
  type: 10,
  content: 'Markdown text here',
  id: 1
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `10` |
| `content` | string | Required. Full markdown supported: `**bold**`, `_italic_`, `` `code` ``, `> blockquote` |
| `id` | integer | Optional. 32-bit int for later identification |

**Limits:**
- All Text Display components combined: max 4000 characters
- Mentions: `@user`, `@role` **will** ping — use `allowed_mentions` on the message to suppress

---

## Section — `type: 9`

Groups 1–3 Text Display items with an `accessory` (Thumbnail or Button) on the right.

```js
{
  type: 9,
  components: [
    { type: 10, content: 'Title text' },
    { type: 10, content: 'Subtitle' },
    { type: 10, content: 'Third line (optional)' }
  ],
  accessory: {
    type: 2,
    custom_id: 'my_button',
    label: 'Click',
    style: 1
  },
  id: 2
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `9` |
| `components` | array | 1–3 `type: 10` (Text Display) objects |
| `accessory` | object | Exactly one: `type: 11` (Thumbnail) or `type: 2` (Button) |
| `id` | integer | Optional |

Thumbnail accessory instead of a button:

```js
{
  type: 9,
  components: [
    { type: 10, content: 'Title text' }
  ],
  accessory: {
    type: 11,
    media: { url: 'https://example.com/image.png' },
    description: 'Alt text',
    spoiler: false
  }
}
```

---

## Thumbnail — `type: 11`

Used only as an `accessory` inside a Section.

```js
{
  type: 11,
  media: { url: 'attachment://image.png' },
  description: 'Alt text',
  spoiler: false,
  id: 3
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `11` |
| `media` | object | `{ url: string }` — `attachment://name` or any HTTPS URL |
| `description` | string | Optional alt text, max 1024 chars |
| `spoiler` | boolean | Optional, blurs the image. Default `false` |
| `id` | integer | Optional |

---

## Media Gallery — `type: 12`

Displays a responsive grid of 1–10 images/media.

```js
{
  type: 12,
  items: [
    {
      media: { url: 'attachment://photo1.png' },
      description: 'Photo 1 description',
      spoiler: false
    },
    {
      media: { url: 'https://i.imgur.com/example.png' },
      description: 'Remote image',
      spoiler: true
    }
  ],
  id: 4
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `12` |
| `items` | array | 1–10 media gallery item objects |
| `id` | integer | Optional |

Each item: `media` (required, `{ url }`), `description` (optional, max 1024 chars), `spoiler` (optional, default `false`).

**Notes:**
- Grid layout (1–4 columns) is managed by Discord based on item count
- Supports both `attachment://` references and external HTTPS URLs
- No audio file support

---

## File — `type: 13`

Displays an uploaded file in the message body (PDF, ZIP, image, etc). Only supports `attachment://`.

```js
{
  type: 13,
  file: { url: 'attachment://report.pdf' },
  spoiler: false,
  id: 5
}
```

```js
await interaction.reply({
  components: [
    { type: 13, file: { url: 'attachment://report.pdf' } }
  ],
  files: [
    { attachment: './report.pdf', name: 'report.pdf' }
  ],
  flags: 32768
});
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `13` |
| `file` | object | `{ url: 'attachment://filename' }` — attachment protocol only |
| `spoiler` | boolean | Optional. Default `false` |
| `id` | integer | Optional |

---

## Separator — `type: 14`

Adds vertical space between components. Optional visual divider line.

```js
{
  type: 14,
  divider: true,
  spacing: 1,
  id: 6
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `14` |
| `divider` | boolean | `true` shows a line, `false` = invisible padding. Default `true` |
| `spacing` | integer | `1` small padding, `2` large padding. Default `1` |
| `id` | integer | Optional |

---

## Container — `type: 17`

Wraps child components in a rounded box with an optional left accent color stripe.

```js
{
  type: 17,
  accent_color: 0x5865F2,
  spoiler: false,
  components: [
    { type: 10, content: 'Header text' },
    { type: 14, divider: true, spacing: 1 },
    {
      type: 9,
      components: [{ type: 10, content: 'Section inside container' }],
      accessory: { type: 2, custom_id: 'btn', label: 'Go', style: 2 }
    },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'confirm', label: 'Confirm', style: 3 },
        { type: 2, custom_id: 'cancel', label: 'Cancel', style: 4 }
      ]
    }
  ],
  id: 7
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `17` |
| `accent_color` | integer | Optional. Hex color as int, e.g. `0x5865F2`, for the left border |
| `spoiler` | boolean | Optional. Blurs all content inside when `true` |
| `components` | array | Child components (see allowed list below) |
| `id` | integer | Optional |

**Container children allowed:** `type: 1` (Action Row), `type: 9` (Section), `type: 10` (Text Display), `type: 12` (Media Gallery), `type: 13` (File), `type: 14` (Separator).

**NOT allowed inside Container:** another `type: 17` (Container) — no nesting.

---

## Action Row — `type: 1`

Wraps interactive components. Can be placed at top level or inside a Container.

```js
{
  type: 1,
  components: [
    { type: 2, custom_id: 'a', label: 'A', style: 1 },
    { type: 2, custom_id: 'b', label: 'B', style: 2 },
    { type: 2, url: 'https://example.com', label: 'Link', style: 5 }
  ]
}
```

Holds up to 5 buttons, **or** a single select menu:

```js
{
  type: 1,
  components: [
    {
      type: 3,
      custom_id: 'my_select',
      placeholder: 'Choose an option...',
      min_values: 1,
      max_values: 2,
      options: [
        { label: 'Option 1', value: 'opt1', description: 'First option', emoji: { name: '1️⃣' } },
        { label: 'Option 2', value: 'opt2', default: true }
      ]
    }
  ]
}
```

User / Role / Channel / Mentionable selects:

```js
{
  type: 1,
  components: [
    {
      type: 5,
      custom_id: 'user_pick',
      placeholder: 'Pick a user',
      min_values: 1,
      max_values: 3
    }
  ]
}
```

| `type` | Select |
|---|---|
| `3` | String Select |
| `5` | User Select |
| `6` | Role Select |
| `7` | Mentionable Select |
| `8` | Channel Select |

---

## Button — `type: 2`

```js
{
  type: 2,
  custom_id: 'my_button',
  label: 'Click',
  style: 1,
  emoji: { name: '👆' },
  disabled: false
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | integer | `2` |
| `style` | integer | See Button Styles below |
| `label` | string | Max 80 chars |
| `emoji` | object | Optional. `{ name, id?, animated? }` |
| `custom_id` | string | Required unless `style: 5` (Link) or `style: 6` (Premium) |
| `url` | string | Required for `style: 5` (Link). No `custom_id` allowed with it |
| `sku_id` | snowflake | Required for `style: 6` (Premium). No `custom_id`, `label`, `url`, or `emoji` |
| `disabled` | boolean | Optional. Default `false` |

**Button Styles**

| Name | `style` | Requires |
|---|---|---|
| Primary | `1` | `custom_id` |
| Secondary | `2` | `custom_id` |
| Success | `3` | `custom_id` |
| Danger | `4` | `custom_id` |
| Link | `5` | `url` |
| Premium | `6` | `sku_id` |

---

## Component ID System

Every component accepts an optional `id` — a unique 32-bit integer.

```js
{ type: 10, content: 'Hello', id: 100 }
{ type: 14, id: 101 }
```

Discord auto-assigns sequential IDs (starting from 1) to any component without an explicit `id`. Auto-assignment order is an implementation detail — always set `id` explicitly if you need to reference a component later, e.g. via `interaction.message.components` in an interaction handler.

---

## Sending the Payload

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [ /* top-level components */ ],
  files: [ /* optional AttachmentPayload objects */ ],
  flags: IS_COMPONENTS_V2
});
```

`files` entries are plain objects, not `AttachmentBuilder` instances:

```js
{ attachment: './image.png', name: 'image.png' }
```
