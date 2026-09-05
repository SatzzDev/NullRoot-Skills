# API Docs UI — docs.html Architecture

## Overview

The docs page (`public/docs.html`) at `api.saturia.codes/docs` is a hand-built static HTML page served by Express. It dynamically renders endpoint cards from a JSON catalog.

## Architecture

- **Source of truth**: `/endpoints` API route returns `{endpoints: [{method, path, description, params: [...]}]}`
- **JS renders everything**: no static HTML cards — the JS fetches `/endpoints` and builds DOM on load
- **Syntax highlighting**: highlight.js (CDN: `cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/`) + `atom-one-dark` theme
- **Language detection**: `detectLang(ct, body)` — checks content-type header or body pattern (`{` → json, `function` → javascript, `<` → html, else text)
- **Copy button**: `navigator.clipboard.writeText(text)` with `execCommand('copy')` fallback, feedback "copied" 2s
- **Language badge**: `<span class="lang-badge json">JSON</span>` with color per language
- **Custom scrollbar**: 5px thin, theme-colored (var(--faint)), applied globally + on `.response-body`
- **Theme-aware**: respects `html.dark` class, CSS custom properties
- **No build step**: Express serves as static file — edits to docs.html take effect immediately

## Status Bar Structure

Each endpoint response builds a status bar:
```html
<div class="response-status">
  <span class="code ok">200 OK</span>
  <span class="time">0.52s</span>
  <button class="copy-btn">copy</button>
  <span class="lang-badge json">JSON</span>
</div>
```

## Adding a New Endpoint

1. Add entry to `/endpoints` catalog in `server.js`:
   ```json
   {
     "method": "GET",
     "path": "/my-endpoint",
     "description": "What it does",
     "params": [
       {"name": "query", "type": "string", "description": "The query", "required": true}
     ]
   }
   ```
2. The dynamic catalog auto-renders the params table + try-it section
3. No HTML edits needed in docs.html itself

## Params Array Format

```javascript
{
  name: 'paramName',     // displayed in table
  type: 'string',        // used in <td class="ptype">
  description: 'desc',   // shown in table
  required: true,        // adds <span class="req">*</span>
  default: 'value'       // pre-filled in try-it input
}
```

## Common Pitfalls

### Two status bars
**Symptom**: Two status bars appear in the response box.
**Cause**: The HTML template includes `<div class="response-status">` with `#rcode-{i}` and `#rtime-{i}` spans. JavaScript creates a new `statusBar` div and appends it without removing the old one.
**Fix**: Before appending the new statusBar, call `respBox.querySelector('.response-status').remove()`.

### statusBar not showing on error
**Symptom**: On error, no status bar appears.
**Cause**: `respBox.appendChild(statusBar)` is inside the `try` block only.
**Fix**: Move `respBox.appendChild(statusBar)` outside the try/catch (after the closing brace of `} catch(e) {`).

### Syntax highlighting not working
**Symptom**: Response body shows plain text, no colors.
**Cause**: CDN inaccessible or highlight.js not loaded.
**Fix**: Check network tab for `highlight.js` and `atom-one-dark` CSS. The `syntaxHighlight()` function catches errors and falls back to HTML-escaped plain text.

### Copy button not working
**Symptom**: Clicking copy does nothing.
**Cause**: Clipboard API blocked in HTTP context or navigator.clipboard undefined.
**Fix**: The `copyToClipboard()` function falls back to `execCommand('copy')` with a hidden textarea.

## CSS Classes Reference

- `.copy-btn` — small button in status bar, hover turns red-soft
- `.lang-badge` — language indicator (json/javascript/text), colored per type
- `.response-status` — flex container for code + time + copy + badge
- `.response-body::-webkit-scrollbar` — custom 5px scrollbar
- `html.dark .hljs-*` — dark mode highlight overrides

## Files
- `/home/saturia/api-saturia-codes/public/docs.html` — main docs page
- `/home/saturia/api-saturia-codes/public/docs.html.bak` — backup of pre-enhancement version
