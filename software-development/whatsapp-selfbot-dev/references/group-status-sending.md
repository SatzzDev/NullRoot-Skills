# Sending group status (story) messages

This session resolved two key facts about sending `groupStatus` messages in a
Baileys selfbot and distilled the verified sending recipe.

## Package landscape

| Package | Version in use | `groupStatus` in proto | Sending helper for `groupStatus` |
|---|---|---|---|
| `@innovatorssoft/baileys` (modified fork) | `^7.0.0-rc14` | ✅ `WAProto` has `groupStatusMessage`, `groupStatusMessageV2`, `groupStatusMentionMessage` | ❌ None — `messages-send.js` does **not** process these fields |
| `gifted-baileys` (separate npm pkg) | `2.5.8` | ✅ | ✅ `GiftedStatus.sendGroupStatus(jid, content)` |

**Check which one is installed** before picking an approach:
```bash
grep -n '"baileys"' package.json        # innovatorssoft fork
grep -n '"gifted-baileys"' package.json # separate pkg
ls node_modules/baileys/lib/Socket/gcstatus.js   # gifted-baileys only
grep -n "groupStatus" node_modules/baileys/lib/Socket/messages-send.js
```
If the grep returns only WAProto matches (no handler in `messages-send.js`),
you are on the **innovatorssoft fork** and must use the manual recipe below.

## Recipe A — manual `relayMessage` (innovatorssoft fork, verified)

The installed `@innovatorssoft/baileys` does not expose `groupStatus` through
`sendMessage()`. Send directly via `relayMessage()` to the group JID wrapped in
`groupStatusMessageV2`, mirroring how WhatsApp ships group stories.

```js
const { generateMessageIDV2 } = require('@innovatorssoft/baileys/lib/Utils/generics')
const { jidNormalizedUser } = require('@innovatorssoft/baileys/lib/WABinary/jid-utils')
// adapt the import path to YOUR bundle layout.

const groupJid = '120363xxxxxx-xxxx@g.us'   // target group
const mediaUrl = 'https://example.com/foto.jpg'

// 1. Build the inner media message (image here; video/audio/text also work)
const { imageMessage } = await sock.getImageUrl ? null : (await generateWAMessageMedia(
    { image: { url: mediaUrl }, caption: 'group status keren!' },
    {
        upload: sock.waUploadToServer,
        logger: sock.logger,
        mediaCache: sock.config?.mediaCache,
        options: sock.config?.options,
    }
))

// 2. Wrap as a group status message
const statusMessage = {
    groupStatusMessageV2: {
        message: imageMessage   // { imageMessage: {...} } proto object
    }
}

// 3. Relay to the group with the group broadcast meta node
await sock.relayMessage(
    groupJid,
    statusMessage,
    {
        messageId: generateMessageIDV2(sock.authState.creds.me.id),
        statusJidList: [groupJid],              // targets who see the status
        additionalNodes: [
            {
                tag: 'meta',
                attrs: {},
                content: [
                    { tag: 'to', attrs: { jid: jidNormalizedUser(groupJid) } }
                ]
            }
        ]
    }
)
```

**Variants by media type** — same wrapper, different inner message builder:
- `text`: `{ extendedTextMessage: { text, ... } }` with `backgroundArgb`/`font`.
- `video`: `videoMessage` (add `ptv: false`).
- `audio`: `audioMessage` with `ptt: true` for a voice-style status.

> Tip: confirm `sock.relayMessage` exists and its option shape by reading
> `node_modules/baileys/lib/Socket/messages-send.js` `relayMessage = async (jid, message, { messageId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, statusJidList }) =>`.

## Recipe B — `giftedStatus` helper (if gifted-baileys is installed)

```js
await sock.giftedStatus.sendGroupStatus(groupJid, {
    image: { url: 'https://example.com/foto.jpg' },
    caption: 'Group status dari bot!'
})
// also available: .sendStatusToGroups(content, groupJidList)
```

The helper builds `groupStatusMessageV2` for you and attaches the right meta
nodes (`is_group_status_mention: 'true'` for recipients). Use B only when the
package is present; otherwise fall back to A.

## Pitfall — do not call `groupStatus: true` inside plain `sendMessage`

`groupStatus: true` is **not** a documented sendMessage option in either package.
The discussion at github.com/WhiskeySockets/Baileys/discussions/2318 treats
`groupStatusMessage` as a content object (`{ groupStatusMessage: {...} }`), not a
boolean flag. Sending `{ text:'hi', groupStatus: true }` to a group JID produces
a normal group message, **not** a group status. Wrap the payload in
`groupStatusMessageV2` and relay to the status broadcast path instead.
