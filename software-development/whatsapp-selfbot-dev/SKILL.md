---
name: whatsapp-selfbot-dev
description: Build or improve a Baileys WhatsApp selfbot.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [whatsapp, baileys, selfbot, nodejs, bot]
    related_skills: [edit-pterodactyl-bot]
---

# WhatsApp selfbot development (Baileys)

Guidance for building or improving a Baileys-based WhatsApp selfbot.

## When to Use
User wants to add a feature, fix a bug, or audit/improve a WhatsApp bot built on Baileys
(the `baileys` npm package, typically running in Docker/Pterodactyl). Also covers choosing the
right interactive-message type.

## Core working principle: audit the real code before suggesting anything
A selfbot is highly specific to its owner's existing commands, helpers, and config. NEVER hand the
user a generic copy-paste feature list ("add broadcast, tagall, afk, anti-link...") — the user
rejected exactly that as "jelek" (bad). Instead:
1. Read `commands/`, `lib/`, `events/`, `config.js`, `package.json` actually present.
2. Suggest only what is (a) missing, (b) backed by code already in the repo, or (c) a concrete bug
   you found. Example of good suggestions this session: hide owner-only commands from non-owners in
   `.menu`; wire up `storeZip` (already in lib) for a `.backup` command; use `Button`/`Carousel`/
   `AIRich` builders that ship in lib/helper.js.
3. Skip features the setup already makes redundant — e.g. a `.restart` command is pointless when
   nodemon hot-reloads on every `.js` file save.

## Command module shape
```js
module.exports = {
  name: "cmdname",
  aliases: ["alias1"],
  description: "What it does",
  category: "utility", // utility|ai|media|tools|owner
  owner: true,         // optional: hide from non-owner in .menu
  cooldown: 5000,
  async run(sock, m, args, reply) { /* ... */ },
};
```
The loader keys off `name` + `aliases`. `m.reply(text)` replies; `m.sender`, `m.key.remoteJid`,
`m.fromMe` are available. Group commands by `category` so `.menu` can group them.

## Security note
Do NOT gate privileged RCE (eval / shell exec) on the same flag as normal authorized users. Use a
separate `RCE_NUMBERS` allow-list in config.js — only the real owner. A bot that lets any
`AUTHORIZED_NUMBERS` entry run `eval`/`exec` is a full RCE hole.

## Interactive message types
See `references/interactive-messages.md` for the verified table of button types + native_flow
params supported by current Baileys, with which ones only render on verified Business numbers.

## references/
- `references/shiroko-button-js.md` — `lib/button.js` builder API (Button, ButtonV2, Carousel, AIRich, Toolkit, storeZip)
- `references/shiroko-handler-snippets.md` — handler.js snippets (command-not-found, DM welcome, help dropdown)
- `references/shiroko-autodownload-scrapers.md` — Instagram/TikTok auto-download using selfbot's `lib/downloader.js` (ttsave/instagram) + YouTube via `api.nasirxml.dev`
- `references/interactive-messages.md` — Button types + native_flow params table

## Group status / story messages
Baileys distinguishes a normal message to a group from a true *group status*
(story shown in the group). The modified `@innovatorssoft/baileys` installed in
this selfbot exposes the proto wire types (`groupStatusMessage`,
`groupStatusMessageV2`) but has **no** `sendMessage`/`relayMessage` handler for
them, so `sendMessage` with `groupStatus: true` does *not* produce a group
status. Use the manual `relayMessage` recipe in
`references/group-status-sending.md` (wrap content in
`groupStatusMessageV2`, relay to the group JID with a `meta`→`to` node and a
`statusJidList`). If `gifted-baileys` is instead installed, the
`sock.giftedStatus.sendGroupStatus(jid, content)` helper is available.

## Selfbot play.js pattern (run signature: `run(sock, m, args, reply, chat)`)
See `references/shiroko-autodownload-scrapers.md` for the full play.js workflow.
Selfbot uses `Button` + `getBuffer(video.thumbnail)` + `yt-search` + `api.nasirxml.dev`,
then sends `audio: { url: downloadUrl }` (NOT `getBuffer` — returns ArrayBuffer, causes `.toString()` error).
Selfbot `yt-search@^2.13.1` is already in selfbot's package.json.
