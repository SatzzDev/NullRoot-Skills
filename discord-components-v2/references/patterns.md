# Discord Components V2 — Real-World Patterns & Recipes

Copy-paste ready patterns using raw JSON component payloads.

---

## 🪪 Profile Card

```js
const IS_COMPONENTS_V2 = 32768;

function buildProfileCard(user, stats) {
  return {
    type: 17,
    accent_color: 0x5865F2,
    components: [
      {
        type: 9,
        components: [
          { type: 10, content: `## ${user.displayName}` },
          { type: 10, content: `<@${user.id}> • Joined <t:${Math.floor(user.joinedTimestamp / 1000)}:R>` }
        ],
        accessory: {
          type: 11,
          media: { url: user.displayAvatarURL({ size: 256 }) },
          description: `${user.displayName}'s avatar`
        }
      },
      { type: 14, divider: true, spacing: 1 },
      {
        type: 10,
        content:
          `**💬 Messages:** ${stats.messages}\n` +
          `**⭐ Reputation:** ${stats.rep}\n` +
          `**🎮 Level:** ${stats.level}`
      }
    ]
  };
}

await interaction.reply({
  components: [buildProfileCard(member.user, userStats)],
  flags: IS_COMPONENTS_V2
});
```

---

## 📄 Paginated Results

```js
const IS_COMPONENTS_V2 = 32768;

const pages = ['Page 1 content...', 'Page 2 content...', 'Page 3 content...'];

function buildPage(items, currentPage, totalPages) {
  const container = {
    type: 17,
    accent_color: 0xEB459E,
    components: [
      { type: 10, content: `## Results (Page ${currentPage}/${totalPages})` },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: items.join('\n') }
    ]
  };

  const nav = {
    type: 1,
    components: [
      {
        type: 2,
        custom_id: `page_prev_${currentPage}`,
        label: '◀ Prev',
        style: 2,
        disabled: currentPage <= 1
      },
      {
        type: 2,
        custom_id: 'page_info',
        label: `${currentPage} / ${totalPages}`,
        style: 2,
        disabled: true
      },
      {
        type: 2,
        custom_id: `page_next_${currentPage}`,
        label: 'Next ▶',
        style: 2,
        disabled: currentPage >= totalPages
      }
    ]
  };

  return { components: [container, nav], flags: IS_COMPONENTS_V2 };
}

await interaction.reply(buildPage(pages.slice(0, 1), 1, pages.length));

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const [action, dir, cur] = interaction.customId.split('_');
  if (action !== 'page') return;

  const newPage = dir === 'next' ? parseInt(cur) + 1 : parseInt(cur) - 1;
  const start = (newPage - 1) * 10;
  await interaction.update(buildPage(pages.slice(start, start + 10), newPage, pages.length));
});
```

---

## ✅ Confirmation Dialog

```js
const IS_COMPONENTS_V2 = 32768;

async function sendConfirmation(interaction, action, details) {
  const dialog = {
    type: 17,
    accent_color: 0xFEE75C,
    components: [
      { type: 10, content: '## ⚠️ Confirm Action' },
      { type: 14, divider: true, spacing: 1 },
      {
        type: 10,
        content:
          `**Action:** ${action}\n` +
          `**Details:** ${details}\n\n` +
          `_This action cannot be undone._`
      }
    ]
  };

  const buttons = {
    type: 1,
    components: [
      { type: 2, custom_id: 'confirm_yes', label: '✅ Confirm', style: 4 },
      { type: 2, custom_id: 'confirm_no', label: '❌ Cancel', style: 2 }
    ]
  };

  await interaction.reply({
    components: [dialog, buttons],
    flags: IS_COMPONENTS_V2,
    ephemeral: true
  });
}
```

---

## 📊 Status Dashboard

```js
const IS_COMPONENTS_V2 = 32768;

function statusEmoji(online) {
  return online ? '🟢' : '🔴';
}

function buildDashboard(services) {
  const children = [
    { type: 10, content: `## 🖥️ System Status\n_Updated <t:${Math.floor(Date.now() / 1000)}:R>_` },
    { type: 14, divider: true, spacing: 1 }
  ];

  for (const svc of services) {
    children.push({
      type: 9,
      components: [
        { type: 10, content: `**${statusEmoji(svc.online)} ${svc.name}**` },
        { type: 10, content: `Latency: \`${svc.latency}ms\` | Uptime: ${svc.uptime}%` }
      ],
      accessory: {
        type: 2,
        custom_id: `details_${svc.id}`,
        label: 'Details',
        style: 2
      }
    });
    children.push({ type: 14, divider: false, spacing: 1 });
  }

  return { type: 17, accent_color: 0x57F287, components: children };
}

await interaction.reply({
  components: [buildDashboard(serviceList)],
  flags: IS_COMPONENTS_V2
});
```

---

## 🖼️ Image Showcase with Caption

```js
const IS_COMPONENTS_V2 = 32768;

async function showImageShowcase(interaction, images) {
  const files = images
    .filter(img => img.path)
    .map((img, i) => ({ attachment: img.path, name: `image${i}.png` }));

  const title = { type: 10, content: '## 🖼️ Image Showcase' };
  const sep = { type: 14, divider: true, spacing: 1 };

  const gallery = {
    type: 12,
    items: images.map((img, i) => ({
      media: { url: img.path ? `attachment://image${i}.png` : img.url },
      description: img.caption || `Image ${i + 1}`
    }))
  };

  await interaction.reply({
    components: [title, sep, gallery],
    files,
    flags: IS_COMPONENTS_V2
  });
}
```

---

## 🗒️ Dynamic Menu (Select + Update)

```js
const IS_COMPONENTS_V2 = 32768;

const menuItems = {
  fruits: { title: '🍎 Fruits', body: 'Apple, Banana, Mango, Strawberry' },
  veggies: { title: '🥦 Vegetables', body: 'Broccoli, Carrot, Spinach' },
  dairy: { title: '🧀 Dairy', body: 'Milk, Cheese, Yogurt, Butter' }
};

function buildMenu(selected = null) {
  const select = {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: 'category_select',
        placeholder: 'Select a category...',
        options: [
          { label: '🍎 Fruits', value: 'fruits' },
          { label: '🥦 Vegetables', value: 'veggies' },
          { label: '🧀 Dairy', value: 'dairy' }
        ]
      }
    ]
  };

  const content = selected
    ? {
        type: 17,
        accent_color: 0x57F287,
        components: [
          { type: 10, content: `## ${menuItems[selected].title}` },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: menuItems[selected].body }
        ]
      }
    : { type: 10, content: '_Select a category above to see its items._' };

  return {
    components: [content, select],
    flags: IS_COMPONENTS_V2
  };
}

await interaction.reply(buildMenu());

client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'category_select') return;
  await interaction.update(buildMenu(interaction.values[0]));
});
```

---

## 📁 File Download Message

```js
const IS_COMPONENTS_V2 = 32768;

async function sendFile(interaction, filePath, filename, description) {
  const card = {
    type: 17,
    accent_color: 0x4285F4,
    components: [
      { type: 10, content: `## 📁 ${filename}` },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: description },
      { type: 14, divider: false, spacing: 1 },
      { type: 13, file: { url: `attachment://${filename}` } }
    ]
  };

  await interaction.reply({
    components: [card],
    files: [{ attachment: filePath, name: filename }],
    flags: IS_COMPONENTS_V2
  });
}
```

---

## 🔔 Notification / Alert Message

```js
const IS_COMPONENTS_V2 = 32768;

const alertColors = {
  info: 0x5865F2,
  success: 0x57F287,
  warning: 0xFEE75C,
  danger: 0xED4245
};

const alertEmojis = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🚨' };

function buildAlert(type, title, message, actionLabel = null, actionId = null) {
  let children;

  if (actionLabel && actionId) {
    children = [
      {
        type: 9,
        components: [
          { type: 10, content: `## ${alertEmojis[type]} ${title}` },
          { type: 10, content: message }
        ],
        accessory: { type: 2, custom_id: actionId, label: actionLabel, style: 1 }
      }
    ];
  } else {
    children = [
      { type: 10, content: `## ${alertEmojis[type]} ${title}` },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: message }
    ];
  }

  const container = { type: 17, accent_color: alertColors[type], components: children };

  return { components: [container], flags: IS_COMPONENTS_V2 };
}

await channel.send(buildAlert('success', 'Deploy Complete', 'v2.4.0 is live in production!', 'View Logs', 'view_logs'));
await channel.send(buildAlert('danger', 'Service Down', 'API server is not responding. Team has been notified.'));
```

---

## 🧩 Inline Payload (no helpers, no imports)

Just write the JSON structure directly wherever you need it — no factory, no separate file.

```js
const IS_COMPONENTS_V2 = 32768;

await interaction.reply({
  components: [
    {
      type: 17,
      accent_color: 0xFF5733,
      components: [
        { type: 10, content: '## Title' },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: 'Body content here.' }
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'ok', label: '✅ OK', style: 1 },
        { type: 2, custom_id: 'cancel', label: '❌ Cancel', style: 2 }
      ]
    }
  ],
  flags: IS_COMPONENTS_V2
});
```

---

## 🚫 V2 vs Legacy Comparison

| Feature | Legacy (V1) | Components V2 |
|---|---|---|
| Text content | `content` field | `type: 10` |
| Images | Embed thumbnail/image | `type: 11`, `type: 12` |
| Rich layout | `EmbedBuilder` | `type: 17` |
| Buttons | ActionRow at message end | Anywhere — top level or inside Container/Section |
| Inline image + text | Not possible | `type: 9` + `accessory: { type: 11 }` |
| Accent color | Embed color | `accent_color` on `type: 17` |
| File display | As attachment | `type: 13` inside message |
| Spoiler | Not for entire message | `spoiler: true` on `type: 17` |
