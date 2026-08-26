# Shiroko Handler Snippets

Copy-paste implementations for user-friendly features in Shiroko/Neoxr-style WhatsApp bots.

> **See also:** `references/shiroko-button-js.md` for a reusable `lib/button.js` module
> that wraps all the `generateWAMessageFromContent` + `biz/native_flow` boilerplate
> below into chainable `Button` / `ButtonV2` classes. When `lib/button.js` is present,
> prefer using it over inline code.

## Refactored: using lib/button.js (Button class)

When `lib/button.js` is available with `Button`, `ButtonV2`, `Toolkit` exports:

### Command not found — using ButtonV2
```js
const { ButtonV2 } = require("./lib/button");

async function sendNotFoundCard(conn, m, command, suggestions) {
  const suggestionText = suggestions.length
    ? `\n\n*Did you mean?*\n${suggestions.join("\n")}`
    : "";
  const text =
    `❌ *Command not found: .*${command}*\n` +
    `Type *.help* to see all available commands.${suggestionText}`;

  await new ButtonV2(conn)
    .setBody(text)
    .setFooter(global.footer || "© Shiroko")
    .addReply("📜 Show Commands", ".help")
    .addReply("🏓 Ping Bot", ".ping")
    .send(m.chat, { quoted: m });
}
```

### First-time DM welcome — using ButtonV2
```js
const { ButtonV2 } = require("./lib/button");

async function maybeWelcomeNewUser(conn, m, isCreator, pushname) {
  // ... check isGroup, fromMe, isCreator, cooldown etc. ...

  await new ButtonV2(conn)
    .setBody(welcomeText)
    .setFooter(global.footer || "© Shiroko")
    .addReply("📜 Lihat Semua Perintah", ".help")
    .addReply("🏓 Cek Status Bot", ".ping")
    .send(m.chat, { quoted: m });
}
```

### Interactive help with single_select dropdown — using Button
```js
const { Button } = require("./lib/button");

const btn = new Button(conn);
btn.setBody(header)
   .setFooter(footer)
   .addSelection("📂 Pilih Kategori");

for (const cat of allCategories) {
  btn.makeSection(cat);
  btn.makeRow(`${emoji} ${cat}`, `${grouped[cat].length} perintah`, "", `.help ${cat.toLowerCase()}`);
}

await btn.setParams({ used_state: "1" }).send(m.chat, { quoted: m });
```

---

## Legacy: inline generateWAMessageFromContent (no lib/button.js needed)

The snippets below use raw `generateWAMessageFromContent` + `relayMessage` with
`biz/native_flow additionalNodes`. Use these when you can't add `lib/button.js`.

## Levenshtein distance (no dependencies)
```js
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) prev[i] = i;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

const didYouMean = (input, candidates, maxDist = 3) => {
  const scored = candidates
    .map((c) => ({ cmd: c, dist: levenshtein(input, c) }))
    .filter((s) => s.dist <= maxDist)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
  return scored.map((s) => `${s.dist <= 1 ? "🔹" : "🔸"} .${s.cmd}`);
};
```

## Interactive "command not found" card
Uses `generateWAMessageFromContent` with `buttonsMessage` + biz native_flow additionalNodes.
```js
async function sendNotFoundCard(conn, m, command, suggestions) {
  const suggestionText = suggestions.length
    ? `\n\n*Did you mean?*\n${suggestions.join("\n")}`
    : "";
  const text =
    `❌ *Command not found: .*${command}*\n` +
    `Type *.help* to see all available commands.${suggestionText}`;

  const msg = generateWAMessageFromContent(m.chat, {
    buttonsMessage: {
      contentText: text,
      footerText: global.footer || "© Shiroko",
      headerType: 1,
      buttons: [
        { buttonId: ".help", buttonText: { displayText: "📜 Show Commands" }, type: 1 },
        { buttonId: ".ping", buttonText: { displayText: "🏓 Ping Bot" }, type: 1 },
      ],
    },
  }, { quoted: m });

  await conn.relayMessage(m.chat, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          { tag: "interactive", attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] },
        ],
      },
    ],
  });
}
```

## First-time DM welcome
Sends a warm welcome card with interactive buttons when a non-owner DMs the bot for the first time.
```js
const repliedToNewUsers = new Set();

async function maybeWelcomeNewUser(conn, m, isCreator, pushname) {
  if (m.isGroup) return;
  if (!m.key?.remoteJid) return;
  if (m.key.fromMe) return;
  if (isCreator) return;
  if (repliedToNewUsers.has(m.key.remoteJid)) return;

  // Don't welcome if the user just sent a command
  const body = extractMessageBody(m);
  if (body?.startsWith(".")) return;

  repliedToNewUsers.add(m.key.remoteJid);
  setTimeout(() => repliedToNewUsers.delete(m.key.remoteJid), 60_000);

  const welcomeText =
    `👋 *Halo! Saya Shiroko Bot*\n\n` +
    `✨ Selamat datang! Saya bot WhatsApp yang bisa membantu kamu:\n` +
    `  • Unduh video/audio dari TikTok, Instagram, YouTube, dsb\n` +
    `  • Sticker, gambar, tool utilitas, dan banyak lagi\n\n` +
    `Ketik *.help* untuk melihat semua perintah yang tersedia.`;

  const msg = generateWAMessageFromContent(m.chat, {
    buttonsMessage: {
      contentText: welcomeText,
      footerText: global.footer || "© Shiroko",
      headerType: 1,
      buttons: [
        { buttonId: ".help", buttonText: { displayText: "📜 Lihat Semua Perintah" }, type: 1 },
        { buttonId: ".ping", buttonText: { displayText: "🏓 Cek Status Bot" }, type: 1 },
      ],
    },
  }, { quoted: m });

  await conn.relayMessage(m.chat, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          { tag: "interactive", attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] },
        ],
      },
    ],
  });
}
```

## Interactive help with single_select dropdown
Instead of a text wall, use `single_select` (dropdown) for category selection:
```js
const msg = generateWAMessageFromContent(m.chat, {
  buttonsMessage: {
    contentText: header,
    footerText: footer,
    headerType: 6,
    locationMessage: { degreesLatitude: 0, degreesLongitude: 0, name: "Shiroko", address: "Bot", jpegThumbnail: thumbBuffer },
    viewOnce: true,
    buttons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({ title: "📂 Pilih Kategori", sections: [{ title: "", rows }] }),
      },
    ],
  },
}, { quoted: m });
```
Each row's `id` is set to `.help {category}` so when a user selects it, the handler's
`extractMessageBody()` returns the selectedRowId, which gets parsed as a command.
