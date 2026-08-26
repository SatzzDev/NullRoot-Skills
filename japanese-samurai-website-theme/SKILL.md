---
name: japanese-samurai-website-theme
title: Japanese / Samurai Themed Website (Next.js + Tailwind)
description: "Build samurai/Japanese themes; dodge the CJK Mincho trap."
version: 0.1.0
author: Hermes
platforms: [linux, macos, web]
metadata:
  hermes:
    tags: [Frontend, Tailwind, Next.js, Japanese, Samurai, Fonts, Theming, CJK]
---

# Japanese / Samurai Themed Website

Build a "samurai vibe" portfolio/site in Next.js + Tailwind v4 without it looking cheap.
The single biggest failure mode is the **CJK font trap** — fix it first.

## When to Use
- User asks for a Japanese / samurai / bushido / 侍 aesthetic on a site.
- Theming a Next.js + Tailwind (v4) project (dark mode, sumi-e palette).
- "fontnya jelek bgt" — text looks thin/awkward after applying a Japanese font.

## THE CRITICAL PITFALL — CJK font pairing
A Japanese **Mincho** (serif) font such as `Shippori Mincho` renders Latin/English
body text **badly**: the glyphs are thin, wide, and oddly proportioned. If you set
`font-family: "Shippori Mincho", serif` on `<body>`, every English paragraph looks broken.
This is the #1 reason a samurai theme "looks jelek".

**Correct pairing (the fix that worked):**
- Headings / kanji accents (侍, 武士道, 義) → **Noto Serif JP** (clean CJK serif, proper Latin).
- Body / long English prose → **Noto Sans JP** (CJK sans, very readable for Latin).
- Roman display caps (e.g. a name in Cinzel) → **Cinzel** for that shogun/engraved feel.
- Kanji-only decorative elements (big 侍 backdrop, hanko seal) can stay Noto Serif JP.

So you use THREE families, not one. Never apply a Mincho to all body text.

### Loading the fonts (Tailwind v4 / Next.js)
Next.js `next/font/google` for Cinzel; load the JP families via a CSS `@import` in
`globals.css`. **Order matters**: the Google Fonts `@import` MUST come *before*
`@import "tailwindcss";` or the build warns and the font may not apply.
```css
@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Noto+Sans+JP:wght@300;400;500;700;900&family=Noto+Serif+JP:wght@400;500;600;700;900&display=swap");
@import "tailwindcss";
```
Define tokens in `@theme` (`--font-serif-jp`, `--font-sans-jp`, `--font-cinzel`) and
utility classes `.font-display`, `.font-serif-jp`, `.font-sans-jp`. Then point body at
Noto Serif JP and use `.font-sans-jp` on paragraphs. A known-good `globals.css` lives in
`templates/samurai-globals.css` — copy + adapt.

## Design system (palette + motifs)
- **Sumi ink black** `#0b0908` background; **washi paper** off-white `#ece3d2` text.
- **Vermilion / shu (aka)** `#c8102e` (bright `#ef3b3b`, deep `#7c0a1c`) — the signature accent.
- **Gold (kin)** `#c9a227` (light `#eccb5e`) — secondary accent, used for tips/highlights.
- Reusable motifs (see `templates/samurai-globals.css`): `.hanko` (vermilion seal stamp),
  `.brush-rule` (gradient underline), `.katana-line` (slash divider with a gold tip),
  `.vertical-kanji` (`writing-mode: vertical-rl`), `.text-samurai` (red→gold gradient text),
  `.card-samurai` (sumi card w/ aka border + hover lift), `.btn-samurai` / `.btn-ghost`.

## Layout pattern that reads as "samurai" (not just recolored)
- **Hero**: giant vertical kanji 侍 as a faint full-bleed backdrop (`text-aka/10`,
  `animate-blade-flash` pulse), name in Cinzel+Noto Serif JP with red→gold gradient, a
  `.katana-line` slash divider, scroll cue "進め".
- **Nav**: fixed top seal (hanko 侍) + a **right-side vertical kanji rail** (侍 道 技 戦 繋)
  that lights vermilion on the active section; mobile drawer uses 開/閉.
- **About**: stats with kanji (年 城 友 茶) + the **Bushido Eight Virtues** grid
  (義 勇 仁 礼 誠 誉 忠 智) — this is what makes it feel authentic, not generic.
- **Skills**: progress bars shaped like a **katana blade** (gradient + glowing gold tip),
  tech stack as 紋 "house crests" grid.
- **Projects**: **kakejiku** (hanging-scroll) cards — image with a sumi gradient wash,
  category tag, expandable details.
- **Contact**: a banner **crest (繋)** + form with JP labels (名前/文/伝言).
- **Global FX**: falling **sakura petals + red embers** (`position: fixed; z-index:5;
  pointer-events:none`) and a **katana cursor** dot that trails the mouse (skip on
  `pointer: coarse`). Keep FX subtle so text stays legible.

## Full-sweep & interactive control polish
After a redesign the user will say "jelek" / "improve all" — that means a **full sweep**, not just the named component. Two failure modes keep biting:

**1. Orphan components left on the OLD theme.** Global/layout components are easy to miss: `ScrollToTop` (was still blue/purple with dead `Demo` code), particle effects, AOS wrappers, footers. After restyling, `search_files` the whole `components/` tree for leftover `blue-*`/`purple-*`/`from-blue`/`to-purple` Tailwind classes AND for any component importing a non-themed style. Fix every one — the user notices the escapees first.

**2. Interactive controls need the same polish as the hero.** A bare `hanko` circle or a generic lucide icon reads as "jelek". Apply the theme deliberately:
- **Buttons** (`.btn-samurai`/`.btn-ghost`): add a `::before` sheen sweep on hover, widen letter-spacing, serif JP labels; on the primary, an arrow that nudges down on hover.
- **Music / toggle**: make it a labeled **pill** ("Sound the War Drum" ↔ "Silence the Drum") with play/pause inside a vermilion circle + a track-title caption — not a lone hanko with a bare icon.
- **Social icons**: use **inline brand SVGs** (Instagram outline `rect`+`circle`+`dot`; GitHub filled `path`) inside a sumi tile with a `from-aka/20 to-kin/10` hover wash + red glow. Never wrap a brand in a `hanko` stamp or a generic lucide glyph.
- **Scroll-to-top**: themed with a **vermilion→gold gradient progress ring** (`strokeDasharray` = 2πr, offset by scroll %), sumi/blur bg, aka border — replace any blue/purple default.

A known-good controls snippet lives in `templates/samurai-controls.tsx` (ScrollToTop + social + music toggle) — copy + adapt.

## Pitfalls
- **Mincho on body = ugly** (above). Use Noto Sans JP for Latin body.
- **Orphan legacy components** — grep every component for `blue-*`/`purple-*` after a redesign; `ScrollToTop` and global FX are the usual escapees. The user catches these first.
- **Bare hanko for controls** — a plain vermilion stamp with one icon looks unfinished; give toggles a label + caption, socials a brand SVG, scroll-to-top a gradient ring.
- **`@import` order** — Google Fonts URL before `@import "tailwindcss"`.
- **Motion kills readability** — petals/cursor are `pointer-events:none` and low-opacity;
  don't animate the main text.
- **Don't recolor blindly** — keep the sumi/aka/kin triad consistent; random blues/purples
  break the theme. Replace every `blue-*/purple-*` Tailwind class with aka/kin equivalents.
- **Accessibility** — keep contrast: washi `#ece3d2` on sumi `#0b0908` passes; aka on sumi
  is fine for accents only, not body text.

## Verification
`npm run build` must compile with no warnings; then load the page and confirm:
(1) English body text uses a normal-width sans, (2) kanji render in a serif, (3) the
big 侍 backdrop is faint, not competing with text. If English still looks thin/wide,
you left a Mincho on body — switch that element to Noto Sans JP.
