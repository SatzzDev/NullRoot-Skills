# Whitescreen after build: `LucideIcon is not defined`

Verified 2026-08-25 on stock Pterodactyl 1.x, Node 22, React + `twin.macro` + `styled-components` + `babel-plugin-styled-components`.

## Symptom
Panel serves HTTP 200 with a **full HTML shell** (title, fonts, `<div id="app"></div>`,
`/assets/bundle.<hash>.js`), but the page is blank/white and `<div id="app">` is empty.
Laravel logs show nothing (APP_DEBUG=false). It looks like a CSS problem but is actually
a **JS runtime crash before React mounts**.

## Root cause
`resources/scripts/components/elements/Icon.tsx` renders a dynamically resolved icon:

```tsx
import * as LucideIcons from 'lucide-react';
const LucideIcon = (LucideIcons as any)[icon];
return <LucideIcon css={tw`inline-block`} className={className} style={style} />;
```

`LucideIcon` only exists *inside the render function*. `babel-plugin-styled-components`
hoists the `css` prop to **module scope**, compiling it to roughly:

```js
var c = (0, n.Ay)(LucideIcon).withConfig({...})({display:"inline-block"});
```

→ `ReferenceError: LucideIcon is not defined` is thrown the instant the bundle is
evaluated (module 7393 in the production bundle). React never runs, `#app` stays empty,
and because the dark theme CSS is injected by the same JS that crashed, the body renders
transparent → **whitescreen**.

This is NOT caused by the gold/color theme edits — those are cosmetic. The rebuild simply
recompiled `Icon.tsx` with the styled-components babel plugin, triggering the hoist.

## Fix
Remove the `css` prop (that is the thing being hoisted). Apply `inline-block` via a plain
`style` instead — `style` does NOT get hoisted by the plugin:

```tsx
const Icon = ({ icon, className, style }: Props) => {
    const LucideIcon = (LucideIcons as any)[icon];
    if (!LucideIcon) {
        console.warn(`Icon "${icon}" not found in lucide-react`);
        return null;
    }
    return <LucideIcon className={className} style={{ display: 'inline-block', ...style }} />;
};
```

General rule: **never put a `css` (twin.macro) prop on a component whose variable name is
only defined at runtime inside a function** (dynamic lookups, `foo[bar]`, ternaries that
aren't constant). The babel plugin creates a `styled(<Identifier>)` at module level and
the identifier is undefined there. Use `style`/`className` for those, or hoist the
component to module scope.

## How it was caught
`node --check` on the bundle passes (syntax is fine) and `curl` returns 200, so the failure
is invisible from the server side. The decisive step was loading the live page in headless
Chromium (`/snap/bin/chromium`) and capturing `pageerror` events — see
`scripts/headless-whitescreen-check.js`.
