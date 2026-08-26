# Inline SVG Lucide Icons for Admin Blade

AdminLTE uses Font Awesome 4 (`fa fa-*`) in `resources/views/layouts/admin.blade.php`.
Replace with inline `<svg>` Lucide icons — no JS init, no CDN dependency.

## Approach
1. Fetch SVG paths from `https://api.iconify.design/lucide/{name}.svg`
2. Inline as `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
   stroke-linecap="round" stroke-linejoin="round" class="icon-lucide">...</svg>`
3. Style via CSS: `.icon-lucide { width: 1.15em; height: 1.15em; vertical-align: middle; }`

## Common mappings
| Font Awesome | Lucide |
|-------------|--------|
| fa-home | home |
| fa-wrench | wrench |
| fa-gamepad | gamepad-2 |
| fa-database | database |
| fa-globe | globe |
| fa-sitemap | network |
| fa-server | hard-drive |
| fa-users | users |
| fa-magic | wand-2 |
| fa-th-large | layout-grid |
| fa-sign-out | log-out |
| fa-clock | clock |

## CSS
```css
.icon-lucide {
    width: 1.15em;
    height: 1.15em;
    vertical-align: middle;
    stroke-width: 2;
}
```

## Note
Do NOT use `unpkg.com` CDN for Lucide in production — it returns 302 redirects
that browsers may not follow reliably for scripts. Use inline SVG or jsdelivr
with pinned version.
