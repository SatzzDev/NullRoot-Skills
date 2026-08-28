# Discord Components V2 — Hermes Bot Syntax

When using the Hermes Discord bot, Components V2 is automatically enabled. You can use special markdown syntax in your messages to trigger rich UI components.

---

## Configuration

Add to `~/.hermes/config.yaml`:

```yaml
discord:
  components_v2:
    enabled: true          # Master switch
    containers: true       # Allow [Container]...[/Container]
    separators: true       # Allow --- separators
    buttons: true          # Allow [Button:style:Label]
    media_galleries: true  # Allow [Media:url]
```

---

## Syntax Reference

### Container

Wraps content in a rounded box with optional accent color (left border).

```
[Container]
content here
[/Container]
```

**With accent color (hex):**

```
[Container:0x5865F2]
content with blue accent
[/Container]
```

**Colors:**
- `0x5865F2` — Discord Blurple
- `0x57F287` — Green
- `0xED4245` — Red
- `0xFEE75C` — Yellow
- `0xEB459E` — Pink
- `0xFF5733` — Orange

---

### Separator

Adds vertical spacing between sections. Use `---` on its own line.

```
first section
---
second section
```

Renders as invisible padding (no visible line).

---

### Buttons

Interactive buttons with custom styles.

```
[Button:primary:Label Text]
```

**Styles:**
- `primary` — Blue button
- `secondary` — Gray button
- `success` — Green button
- `danger` — Red button
- `link` — URL link button (not yet implemented)

**Example:**

```
[Container]
Choose an action below
[/Container]

[Button:success:Approve]
[Button:danger:Reject]
```

Buttons automatically generate `custom_id` from the label (e.g. `btn_approve`, `btn_reject`).

---

### Media Gallery

Display images in a responsive grid (1-10 images).

```
[Media:https://example.com/image1.png]
[Media:https://example.com/image2.png]
```

Multiple `[Media:...]` on the same line create a single gallery:

```
[Media:https://i.imgur.com/a.png] [Media:https://i.imgur.com/b.png] [Media:https://i.imgur.com/c.png]
```

**Supported:**
- `https://` URLs
- `attachment://filename.png` (for uploaded files)

---

### Thumbnail

Small image displayed inline with text (used in Section components).

```
[Thumbnail:https://example.com/avatar.png]
```

Currently parsed but not fully implemented in the auto-converter.

---

## Complete Example

```
[Container:0x5865F2]
## 🚀 Deployment Status

Build completed successfully
---
**Duration:** 2m 34s
**Commit:** abc123d
[/Container]

[Button:success:View Logs]
[Button:secondary:Rollback]
```

**Renders as:**
- Blue-accented container with header
- Text content
- Separator line
- Two buttons below

---

## Fallback Behavior

- If no special syntax is detected, text is sent as a plain Components V2 Text Display
- If Components V2 is disabled in config, falls back to plain text chunks (legacy behavior)
- Syntax errors (unclosed containers, etc.) render as plain text

---

## Limitations

- Max 40 components per message (nested count too)
- Max 4000 chars across all Text Display components
- Containers cannot nest inside other containers
- Media galleries limited to 10 items
- Buttons limited to 5 per Action Row

---

## Debugging

Check gateway logs for Components V2 parsing:

```bash
tail -f ~/.hermes/logs/gateway.log | grep -i component
```

Or test the parser directly:

```python
from plugins.platforms.discord.components_v2_builder import text_to_components_v2
import json

content = '''[Container]
test
[/Container]'''

components, flags = text_to_components_v2(content)
print(json.dumps(components, indent=2))
```
