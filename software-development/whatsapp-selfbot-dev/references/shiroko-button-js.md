---
name: shiroko-button-js
description: "Reusable lib/button.js for Shiroko/Neoxr WhatsApp bots — Button, ButtonV2, Carousel, AIRich, Toolkit, storeZip exports."
tags: [whatsapp, baileys, shiroko, buttons, interactive-messages]
---

# lib/button.js for Shiroko bots

A lightweight, self-contained `lib/button.js` module that provides the same
`Button` / `ButtonV2` / `Carousel` / `AIRich` / `Toolkit` / `storeZip` API
available in the selfbot's `lib/helper.js`, packaged as a standalone file for
Shiroko-style bots.

## When to use
- You need interactive button cards, dropdowns (single_select), carousel cards,
  or AI-style rich messages in a Shiroko-style bot (handler.js with `execute`-based
  commands, index.js with Baileys).
- Avoids repeating `generateWAMessageFromContent` + `relayMessage` + `biz/native_flow`
  boilerplate in every command and handler.

## Exports
```js
const { Button, ButtonV2, Carousel, AIRich, Toolkit, storeZip } = require("./lib/button");
```

## Button (native_flow interactive message)
Chainable builder using the modern `interactiveMessage` payload.
```js
await new Button(conn)
  .setBody("Pick an option")
  .setFooter("© Shiroko")
  .addReply("Help", ".help")
  .addSelection("📂 Categories")
    .makeSection("Menu")
    .makeRow("🎨 Sticker", "Sticker pack", "", ".help sticker")
  .setParams({ used_state: "1" })
  .send(m.chat, { quoted: m });
```

## ButtonV2 (classic buttonsMessage card)
Simpler buttonsMessage format with thumbnail support.
```js
await new ButtonV2(conn)
  .setBody("Hello!")
  .setFooter("© Shiroko")
  .addReply("Show Help", ".help")
  .addReply("Ping", ".ping")
  .setThumbnail(thumbBuffer)
  .send(m.chat, { quoted: m });
```

## Toolkit
- `Toolkit.resize(buffer, w, h, fit)` — resize image buffer via sharp
- `Toolkit.fetchBuffer(url, opts, {silent})` — fetch remote buffer
- `Toolkit.randomUUID()` — generate a random UUID string

## storeZip
Minimal in-memory ZIP builder (no `archiver` dep needed):
```js
const zip = storeZip([{ name: "file.txt", data: Buffer.from("hello") }]);
await sock.sendMessage(jid, { document: zip, fileName: "out.zip", mimetype: "application/zip", caption }, { quoted: m });
```

## Pitfalls (learned this session)
1. **Do NOT add `fs.watchFile` auto-reload at the bottom of button.js** — the
   callback re-requires the module mid-load, causing `ReferenceError: fs/path is
   not defined`. Nodememon already hot-reloads on `.js` file changes, so the
   in-file watcher is redundant and harmful.

2. **ButtonV2 does NOT have `addReply` in the selfbot's `lib/helper.js`** — only
   `addButton`. If you create a new `lib/button.js`, make sure to add:
   ```js
   addReply(displayText = "", buttonId) {
     this._buttons.push({ buttonId: buttonId || displayText, buttonText: { displayText }, type: 1 });
     return this;
   }
   ```
   Otherwise `.addReply(...).addReply(...)` chains will throw
   `TypeError: ...addReply is not a function`.

3. **Do NOT copy the selfbot's `lib/helper.js` directly** as `button.js` — it
   `require("../config")` which doesn't exist in Shiroko's structure, and it
   imports `fluent-ffmpeg`, `request`, etc. that may not be in Shiroko's
   `node_modules`. Create a standalone `button.js` that only depends on
   `baileys`, `sharp`, `fs`, `path`.

4. **Verify inside the container, not via `node --check`** — syntax check passes
   even when runtime deps are missing. Use:
   ```bash
   sudo docker exec <uuid> node -e "const m = require('./lib/button'); console.log(Object.keys(m))"
   ```
   This catches missing modules and circular requires.

5. **Global vs require** — `lib/button.js` sets `global.Button`, `global.ButtonV2`,
   etc. In handler.js, prefer `require("./lib/button")` over relying on globals
   (globals from another file may not be set yet if load order differs). Use:
   ```js
   const { ButtonV2 } = require("./lib/button");
   // or
   const ButtonV2 = global.ButtonV2 || require("./lib/button").ButtonV2;
   ```
