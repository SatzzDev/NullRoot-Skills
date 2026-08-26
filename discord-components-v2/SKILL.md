---
name: discord-components-v2
description: >
  Master skill for building Discord bot messages using Components V2 with discord.js (Node.js/JavaScript),
  using raw JSON component payloads instead of builder classes. Use this skill whenever the user asks about
  Discord Components V2, building interactive bot UIs, replacing embeds with components, TextDisplay, Section,
  MediaGallery, Container, Separator, File, Thumbnail, or any new Discord message layout system introduced in 2025.
  Trigger for phrases like: "discord components v2", "discord bot UI", "discord message layout",
  "replace discord embed", "discord interactive message", "discord json components", "discord container",
  or anything involving bot message design in discord.js. Always use this skill when Components V2 is mentioned
  or clearly implied in Discord bot development context.
---

# Discord Components V2 — Master Skill

Discord Components V2 (released March 2025) replaces the old embed + ActionRow system with a fully modular, composable layout engine. Messages are built entirely from **components** stacked together — no more `content` string or `embeds` array.

Every component is a plain JSON object with a numeric `type` field. discord.js accepts these raw objects directly in `components:` — no builder classes needed.

---

## ⚡ Quick Start

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [
    { type: 10, content: 'Hello world' }
  ],
  flags: IS_COMPONENTS_V2
});
```

**Key rules (memorize these):**
- ❌ Cannot use `content`, `embeds`, `poll`, or `stickers` in a V2 message
- ❌ Once sent with `flags: 32768`, the message stays V2 forever
- ✅ Max **40 total components** per message (nested ones count too)
- ✅ Max **4000 chars** across all `type: 10` (Text Display) components combined
- ✅ All files must be explicitly referenced in a component (`type: 11`, `12`, or `13`)
- ✅ All fields are `snake_case` (`custom_id`, `accent_color`), not camelCase

---

## 🧱 Component Types

| Component | `type` | Purpose |
|---|---|---|
| Action Row | `1` | Holds interactive components (buttons, selects) |
| Button | `2` | Clickable button (inside Section accessory or ActionRow) |
| String Select | `3` | Dropdown with defined options |
| User Select | `5` | Dropdown of server members |
| Role Select | `6` | Dropdown of server roles |
| Mentionable Select | `7` | Dropdown of users + roles |
| Channel Select | `8` | Dropdown of server channels |
| Section | `9` | Text + right-side accessory (button or thumbnail) |
| Text Display | `10` | Markdown text (replaces embed description) |
| Thumbnail | `11` | Image inside a Section's `accessory` field |
| Media Gallery | `12` | Grid of up to 10 images/media |
| File | `13` | Displays an uploaded file in message body |
| Separator | `14` | Vertical spacing / divider line |
| Container | `17` | Rounded box with accent color — wraps other components |

> For full field-by-field JSON structure of each type → read `references/components.md`
> For full code recipes and patterns → read `references/patterns.md`

---

## 📐 Layout Hierarchy

```
Message (flags: 32768)
├── type 10  TextDisplay      ← standalone text block
├── type 9   Section          ← text + accessory (thumbnail or button)
│   ├── components: [type 10, ...]  (1–3 TextDisplay)
│   └── accessory: type 11 (Thumbnail) | type 2 (Button)
├── type 12  MediaGallery     ← image grid (up to 10 items)
├── type 13  File             ← single file display
├── type 14  Separator        ← spacing / divider
├── type 17  Container        ← wraps children in a rounded box
│   ├── type 10  TextDisplay
│   ├── type 9   Section
│   ├── type 14  Separator
│   ├── type 1   ActionRow
│   │   └── type 2 Button | type 3/5/6/7/8 Select
│   └── type 12  MediaGallery
└── type 1   ActionRow        ← interactive components at top level
    └── type 2 Button | type 3/5/6/7/8 Select
```

---

## 🚦 When to use what

| Goal | Use `type` |
|---|---|
| Display text/markdown | `10` (Text Display) |
| Show image next to text | `9` (Section) with `accessory: { type: 11 }` |
| Multiple images in a grid | `12` (Media Gallery) |
| Attach a downloadable file | `13` (File) |
| Add visual spacing | `14` (Separator) |
| Group components in a styled box | `17` (Container) with `accent_color` |
| Action buttons below content | `1` (Action Row) with `type: 2` children |
| Text + inline button | `9` (Section) with `accessory: { type: 2 }` |

---

## 🔧 Minimal Working Example

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [
    {
      type: 10,
      content: '## 👋 Hello World!\nThis is a **Components V2** message.'
    },
    {
      type: 14,
      divider: true,
      spacing: 1
    },
    {
      type: 10,
      content: '_Powered by raw Components V2 JSON payloads_'
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: 'click_me',
          label: 'Click Me!',
          style: 1
        }
      ]
    }
  ],
  flags: IS_COMPONENTS_V2
});
```

---

## 🎨 Container with Accent Color

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [
    {
      type: 17,
      accent_color: 0x5865F2,
      components: [
        { type: 10, content: '## 📦 Card Title' },
        { type: 14, divider: false },
        { type: 10, content: 'Card body text here.' }
      ]
    }
  ],
  flags: IS_COMPONENTS_V2
});
```

---

## 🖼️ Media Gallery

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [
    {
      type: 12,
      items: [
        { media: { url: 'attachment://image.png' }, description: 'Alt text here' },
        { media: { url: 'https://i.imgur.com/example.png' }, spoiler: false }
      ]
    }
  ],
  files: [
    { attachment: './image.png', name: 'image.png' }
  ],
  flags: IS_COMPONENTS_V2
});
```

---

## 🔄 Handling Button Interactions

```js
const IS_COMPONENTS_V2 = 32768;

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'click_me') {
    await interaction.update({
      components: [
        { type: 10, content: '✅ Button clicked!' }
      ],
      flags: IS_COMPONENTS_V2
    });
  }
});
```

---

## ⚠️ Common Pitfalls

1. **Forgetting `flags: 32768`** → Components render as legacy (no layout)
2. **Using `content` alongside V2 components** → Discord ignores it / throws error
3. **Not referencing uploaded files in a component** → File won't show
4. **Nesting Container inside Container** → Not supported
5. **More than 3 `type: 10` children in a Section's `components`** → Max is 3
6. **More than 10 items in Media Gallery `items`** → Max is 10
7. **Exceeding 40 total components** → Discord rejects the message
8. **Exceeding 4000 chars across all Text Display `content` fields** → Discord rejects the message
9. **camelCase field names** → API is `snake_case`: `custom_id`, `accent_color`, not `customId`, `accentColor`
10. **Section `accessory` missing its own `type` field** → It's a full component object (`{ type: 11, media: {...} }` or `{ type: 2, ... }`), not a bare URL/string

---

## 📚 Reference Files

- **`references/components.md`** — Full JSON field reference for every component type
- **`references/patterns.md`** — Real-world recipes: profile cards, pagination, dashboards, alerts, file upload flows

Read these when you need detailed field structures or building complex real-world layouts.
