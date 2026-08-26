# AdminLTE Dark/Gold CSS Override

Comprehensive CSS override for Pterodactyl's admin panel (AdminLTE `skin-blue`,
Bootstrap 3/jQuery/PHP blade). Loaded as a static CSS file after `pterodactyl.css`.

## Injection point
Add to `resources/views/layouts/admin.blade.php` after `pterodactyl.css`:
```html
<link rel="stylesheet" href="/themes/pterodactyl/css/saturiahost-admin.css?v=3">
```

## Key selectors covered
- `.skin-blue .main-header` → gold gradient header
- `.skin-blue .main-sidebar` → dark sidebar with gold active accent
- `.content-wrapper` → near-black background
- `.box` → dark panel with gold top border
- `.table thead` → dark header, Cinzel font, gold text
- `.btn-primary` → gold gradient button
- `.form-control` → dark input with gold focus ring
- `.nav-tabs`, `.pagination`, `.modal`, `.dropdown-menu`, `.alert`, `.label`, `.badge`
  → all recolored gold/dark
- Scrollbar and selection → gold accent

## Font
Import Cinzel + Noto Sans JP via `@import` or `<link>` in admin blade.
Use `font-family: 'Cinzel', 'Noto Serif JP', serif` for headings.

## Note
No rebuild needed — CSS is static. Always bump `?v=N` query string when updating
to bust browser cache. Clear Laravel view cache after blade edits.
