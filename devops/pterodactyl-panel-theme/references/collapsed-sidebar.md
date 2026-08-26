# Collapsed Sidebar State

When the Pterodactyl sidebar is collapsed (`.sidebar-mini.sidebar-collapse`), the
logo text and menu items clip because the collapsed width (~50px) is too small for
full text.

## Logo clipping bug
The "SAT" (or "SATURIAHOST") logo text gets clipped in collapsed state because
`.main-header .logo` has a fixed width of 50px and `overflow: hidden`.

Fix — auto-width + centered text:
```css
.sidebar-mini.sidebar-collapse .main-header .logo {
    width: auto !important;
    min-width: 50px !important;
    padding: 0 12px !important;
    text-align: center !important;
}
.sidebar-mini.sidebar-collapse .main-header .logo span {
    display: block !important;
    font-size: 1.4rem !important;
    font-weight: 700 !important;
    letter-spacing: 0.05em !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    white-space: nowrap !important;
    text-overflow: clip !important;
}
```

## Menu items (interrupted task)
The user requested that collapsed menu items show only the first character of the
label (e.g. "Servers" → "S") when no icon is used. This was interrupted before
implementation. If resuming: target `.sidebar-mini.sidebar-collapse .sidebar-menu > li > a`
and use `text-overflow: clip` with a narrow width, or truncate via `::after`
pseudo-element showing just the first letter.

## Files
- `public/themes/pterodactyl/css/saturiahost-admin.css` — add after `/* ===== Sidebar ===== */`
- `resources/views/layouts/admin.blade.php` — verify `sidebar-mini` class on `<body>`
