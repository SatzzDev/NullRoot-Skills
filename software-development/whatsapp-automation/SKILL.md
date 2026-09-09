---
name: whatsapp-automation
description: Use when building WhatsApp bots or AI agents via WA.
trigger_keywords:
  - whatsapp bot
  - whatsapp agent
  - baileys
  - whatsapp-web.js
  - whatsapp automation
  - whatsapp ai agent
---

# WhatsApp Automation

Build WhatsApp bots and automation agents using whatsapp-web.js or Baileys.

## Library Selection

**Default to whatsapp-web.js over Baileys** — whatsapp-web.js uses standard npm packages and avoids git dependencies that may be blocked in restricted npm environments.

### When npm blocks git dependencies

If `npm install` fails with `EALLOWGIT` ("Fetching packages of type 'git' have been disabled"), the environment's npm config blocks git-protocol dependencies. Baileys depends on `libsignal` via git URL, which triggers this.

**Workaround:** Use whatsapp-web.js instead:

```json
{
  "dependencies": {
    "whatsapp-web.js": "^1.25.0",
    "qrcode-terminal": "^0.12.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.4.5"
  }
}
```

Do NOT attempt to bypass npm config (e.g., `npm config set fetch-allow-git`) — that flag does not exist and the block is typically server-wide policy.

### Baileys (when git deps are allowed)

Use Baileys when:
- Multi-device support needed (native)
- Lower resource footprint required
- Git dependencies are not blocked

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.7",
    "@hapi/boom": "^10.0.1",
    "pino": "^9.4.0",
    "qrcode-terminal": "^0.12.0"
  }
}
```

## Project Structure

Standard layout for WhatsApp automation agents:

```
project/
├── package.json
├── .env                    # Config (OWNER_NUMBER, ALLOWED_NUMBERS)
├── .env.example
├── src/
│   ├── index.js           # Main entry, client setup
│   ├── handlers/
│   │   ├── message.js     # Message router
│   │   ├── commands.js    # Command handler (/help, /status, etc)
│   │   └── ai.js          # AI chat handler (LLM integration point)
│   └── utils/
│       └── scheduler.js   # Cron tasks (scheduled backups, etc)
└── auth_info/             # Session data (auto-generated, gitignored)
```

## Core Implementation Pattern

### whatsapp-web.js

**index.js:**
```javascript
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './auth_info' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot ready');
});

client.on('message', async (msg) => {
  if (msg.fromMe || msg.isStatus) return;
  // Route to handlers
});

await client.initialize();
```

**Sending messages:**
```javascript
// Text
await client.sendMessage(chatId, { text: 'Hello' });

// File
import { MessageMedia } from 'whatsapp-web.js';
const media = MessageMedia.fromFilePath('/path/to/file');
await client.sendMessage(chatId, media, { caption: 'File caption' });

// Reply
await msg.reply('Response text');

// React
await msg.react('✅');
```

**Chat ID format:**
- Private: `628xxx@c.us`
- Group: `628xxx@g.us`

### Baileys

**index.js:**
```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
const sock = makeWASocket({ auth: state });

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
  if (qr) qrcode.generate(qr, { small: true });
  if (connection === 'close') {
    const shouldReconnect = 
      (lastDisconnect?.error instanceof Boom) &&
      lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
    if (shouldReconnect) setTimeout(() => initialize(), 3000);
  }
});

sock.ev.on('messages.upsert', async ({ messages }) => {
  // Handle messages
});
```

**Sending messages:**
```javascript
// Text
await sock.sendMessage(jid, { text: 'Hello' });

// File
await sock.sendMessage(jid, {
  document: { url: '/path' },
  fileName: 'file.txt',
  mimetype: 'text/plain'
});

// React
await sock.sendMessage(jid, {
  react: { text: '✅', key: msg.key }
});
```

**JID format:**
- Private: `628xxx@s.whatsapp.net`
- Group: `628xxx@g.us`

## Common Patterns

### Authorization

```javascript
const allowedNumbers = process.env.ALLOWED_NUMBERS?.split(',').map(n => n.trim().replace(/[^0-9]/g, '')) || [];

function isAllowed(number) {
  if (allowedNumbers.length === 0) return true; // Open access
  const cleaned = number.replace(/[^0-9]/g, '');
  return allowedNumbers.includes(cleaned);
}

// In message handler
const contact = await msg.getContact();
if (!isAllowed(contact.number)) return;
```

### Command Router

```javascript
const text = msg.body.trim();

if (text.startsWith('/') || text.startsWith('!')) {
  const [command, ...args] = text.split(/\s+/);
  await commandHandler.handle(msg, command.toLowerCase(), args);
} else if (process.env.ENABLE_AI_CHAT === 'true') {
  await aiHandler.handle(msg, text);
}
```

### Scheduled Tasks

```javascript
import cron from 'node-cron';

const task = cron.schedule('0 0 * * *', async () => {
  const targetChat = process.env.BACKUP_TARGET_NUMBER;
  await client.sendMessage(targetChat, { text: 'Daily backup' });
  // Send file, run command, etc
});
```

### System Commands

Common commands to implement:
- `/help` — Command list
- `/status` — System overview (CPU, RAM, uptime)
- `/disk` — Disk usage via `df -h`
- `/memory` — Memory via `free -h`
- `/backup` — Trigger manual backup
- `/shell <cmd>` — Owner-only shell execution

Use `exec` from `child_process` with proper timeouts:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const { stdout } = await execAsync('df -h /', { timeout: 10000 });
await msg.reply(`\`\`\`${stdout}\`\`\``);
```

## Production Deployment

### Systemd Service

```ini
[Unit]
Description=WhatsApp AI Agent
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/project
Environment=NODE_ENV=production
ExecStart=/path/to/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-agent
sudo systemctl start whatsapp-agent
sudo journalctl -u whatsapp-agent -f
```

## Environment Configuration

**Required .env:**
```env
OWNER_NUMBER=628xxx
ALLOWED_NUMBERS=628xxx,628yyy
BOT_MODE=all
ENABLE_AI_CHAT=true
ENABLE_SCHEDULED_TASKS=true
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 0 * * *
BACKUP_TARGET_NUMBER=628xxx
```

## Pitfalls

**Check npm git policy before choosing library** — Run `npm install @whiskeysockets/baileys` in a test directory first. If it fails with `EALLOWGIT`, use whatsapp-web.js from the start instead of debugging npm config.

**Puppeteer install scripts may be blocked** — If `npm install whatsapp-web.js` shows `allowScripts` warnings for puppeteer, run `npm install-scripts approve puppeteer` or set `PUPPETEER_SKIP_DOWNLOAD=true` and install Chromium separately.

**Auth directory must persist** — The `auth_info/` (or `.wwebjs_auth/`) directory contains session credentials. Add to `.gitignore` but ensure it survives across deployments. Loss requires re-scanning QR.

**QR scan timeout** — QR codes expire after ~60 seconds. If initialization is slow, the QR may be stale by the time it renders. Generate QR only when `qr` event fires, not earlier.

**Chat ID format varies by library** — whatsapp-web.js uses `@c.us` for private chats; Baileys uses `@s.whatsapp.net`. Check the message object for the correct format before hardcoding.

**Owner verification must extract number correctly** — `msg.key.remoteJid` includes domain suffix. Strip to digits-only before comparing: `number.replace(/[^0-9]/g, '')`.

**Scheduled tasks start only after 'ready' event** — Initialize cron tasks inside the `ready` handler, not at module load, or they may attempt to send before the client is connected.
