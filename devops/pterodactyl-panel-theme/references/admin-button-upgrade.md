# Metallic Gold AdminLTE Button CSS

Premium button styling for Pterodactyl's admin panel (AdminLTE `skin-blue`,
Bootstrap 3). Overrides the flat gold buttons with multi-stop metallic
gradients, glow animation, and lift-on-hover.

## Injection point
`public/themes/pterodactyl/css/saturiahost-admin.css` — loaded AFTER
`pterodactyl.css` in `resources/views/layouts/admin.blade.php`:
```html
<link rel="stylesheet" href="/themes/pterodactyl/css/saturiahost-admin.css?v=7">
```

Bump `?v=N` on every edit to bust browser cache.

## Color palette (CSS variables)
```css
:root {
    --sh-gold: #d4af37;
    --sh-gold-deep: #b8860b;
    --sh-gold-soft: #e8cb6e;
    --sh-gold-dim: #7a5711;
}
```

## Metallic gradient recipe
A 4-stop gradient creates the metallic look (light → gold → deep → very deep):
```css
background: linear-gradient(180deg, #f5d97a 0%, #d4af37 35%, #b8860b 70%, #8b6508 100%) !important;
```

## Sheen overlay (::before + ::after)
Two pseudo-elements create the reflective shine:
- `::before`: full-button gradient overlay (white top → transparent middle → dark bottom)
- `::after`: top-edge highlight (white gradient, rounded bottom edge)

```css
.btn::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 45%, rgba(0,0,0,0.15) 100%) !important;
    opacity: 0.7 !important;
    transition: opacity 0.25s ease !important;
    pointer-events: none !important;
    z-index: 1 !important;
}
.btn::after {
    content: '' !important;
    position: absolute !important;
    top: 1px !important;
    left: 10% !important;
    right: 10% !important;
    height: 40% !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%) !important;
    border-radius: 6px 6px 50% 50% / 6px 6px 8px 8px !important;
    pointer-events: none !important;
    z-index: 2 !important;
}
```

## Glow animation
```css
@keyframes sh-gold-glow {
    0%   { box-shadow: 0 6px 20px rgba(212,175,55,0.35), 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3) !important; }
    100% { box-shadow: 0 6px 28px rgba(212,175,55,0.55), 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 30px rgba(212,175,55,0.15) !important; }
}
.btn-primary {
    animation: sh-gold-glow 3s ease-in-out infinite alternate !important;
}
```

## Hover / Active / Focus states
- **Hover**: brighter gradient + translateY(-2px) + stronger box-shadow
- **Active**: translateY(1px) + reduced shadow (press effect)
- **Focus**: outline:none + ring (box-shadow with 0 0 0 4px rgba(gold, 0.45))

## Segmented toggle buttons (2FA)
```css
.btn-group > .btn.active {
    background: linear-gradient(180deg, #f5d97a 0%, #d4af37 35%, #b8860b 70%, #8b6508 100%) !important;
    border-color: #8b6508 !important;
    color: #1a1208 !important;
    font-weight: 700 !important;
    box-shadow: 0 6px 20px rgba(212,175,55,0.4), 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3) !important;
}
```

## Specificity wars
AdminLTE's `skin-blue.min.css` and `pterodactyl.css` both define `.btn-primary`.
Our override MUST use `!important` on every property to win. Load order in
`admin.blade.php`:
1. `bootstrap.min.css`
2. `admin.min.css`
3. `skin-blue.min.css`
4. `pterodactyl.css`
5. **`saturiahost-admin.css`** ← our override (last = wins)

## Verification
After applying CSS changes:
1. Hard refresh browser (Ctrl+Shift+R)
2. Open admin settings page
3. Inspect the Save button — computed styles should show our gradient + box-shadow
4. Hover — button should lift 2px with brighter gradient
5. Active — button should press down 1px

## User feedback loop (this session, 2026-08-25)
The user went through 7+ iterations before landing on the final look. Key signals:
- **"Flat, not metallic"** — even with 4-stop gradient + `::before`/`::after` sheen, the button still read as "flat yellow block." The missing piece was `inset 0 1px 0 rgba(255,255,255,0.3)` (inner top highlight) + a subtle `animation: sh-gold-glow` (pulsing box-shadow). Without the inner highlight the gradient looks painted-on, not embossed.
- **"Save button terlalu kecil"** — the `.btn-sm` class made the Save button tiny relative to the dark content area. Override `button[type="submit"].btn-primary` with larger padding (`0.9rem 2.6rem`) and `font-size: 1.15rem`.
- **"Semakin buruk"** — adding `border-bottom` to `.content-header` created a double-line effect with the header's existing bottom border. The user hated it. Fix: `border-bottom: none` on the header, use `margin-bottom` for spacing instead.
- **"Header terlalu dekat dengan separator sidebar"** — the content header was cramped against the sidebar divider. Fix: increase `padding-top` on `.content` and add `margin-bottom` to `.content-header`.
- **"Deskripsinya dibawah"** — the `<small>` description should be below the `<h1>`, not inline. Fix: `display: block` on `.content-header > h1 > small`.
- **"Posisi header dan descnya harusnya sedikit kekanan dan kebawah"** — add `padding-left` to `.content-header` and `margin` for vertical spacing.
- **"Kekurangannya kurang sejajar dengan table"** — the header's horizontal padding must match the table's first-cell padding for visual alignment.
- **CSS brace errors** — repeated find-replace edits left orphan closing braces (2 extra `}`). The user caught them at lines 179-183 and 335-340. Always count `{` vs `}` after bulk edits; mismatch = silent CSS breakage downstream. Use a stack-based brace checker to find exact orphan lines.
- **"Ajarkan saya cara mengubahnya, dimana filenya"** — the user wants to self-service future CSS edits. Document the file path + section structure so they can edit directly.

## Content header layout (final working version)
```css
.content {
    padding: 32px 28px 28px !important;
}
.content-header {
    padding: 0 0 20px 20px !important;
    margin: 0 0 12px !important;
    border-bottom: 1px solid var(--sh-border) !important;
}
.content-header > h1 {
    font-family: 'Cinzel', serif !important;
    color: var(--sh-gold-soft) !important;
    font-weight: 700 !important;
    letter-spacing: 0.06em !important;
    font-size: 1.7rem !important;
    margin: 0 0 10px 0 !important;
    display: block !important;
}
.content-header > h1 > small {
    color: var(--sh-text-dim) !important;
    font-size: 0.95rem !important;
    display: block !important;
    margin-top: 6px !important;
}
```

## Self-service guide for the user
When the user asks "how do I change X":
- **File**: `/var/www/pterodactyl/public/themes/pterodactyl/css/saturiahost-admin.css`
- **Bump version** in `resources/views/layouts/admin.blade.php` (`?v=N` → `?v=N+1`)
- **Clear cache**: `cd /var/www/pterodactyl && php artisan view:clear`
- **Hard refresh**: Ctrl+Shift+R
- **Key sections** (search for these markers):
  - `/* ===== Layout / Content area ===== */` — content padding, header positioning
  - `/* ===== Buttons ===== */` — all button styling
  - `/* === PRIMARY — Metallic Gold === */` — Save button
  - `/* === Segmented button group (2FA toggle) === */` — 2FA toggle
- **After any bulk edit**: count `{` vs `}` to catch orphan braces
