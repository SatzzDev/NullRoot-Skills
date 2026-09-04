# Essentials Plugin CSS Theme Override

## The Problem

When the **essentials** plugin is installed, `plugins/essentials/resources/css/theme.css` compiles to `public/build/assets/theme-*.css` with this selector:

```css
:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div {
    padding: 1rem 1.15rem;
}
```

This overrides all Tailwind utility classes (`p-5`, `gap-6`, `px-4`, etc.) on the server list card because the selector has specificity (0,1,1) and no `!important`, while Tailwind utilities are unmarked.

## The Fix

### 1. Append override rules to `plugins/essentials/resources/css/theme.css`

```css
/* Add at the end of theme.css */

:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div {
    padding: 1.25rem 1.5rem !important;
}

:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div > div:first-child {
    padding-bottom: 0.75rem !important;
    margin-bottom: 0.5rem !important;
    border-bottom: 1px solid var(--ld-border) !important;
}

:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div > div:last-child {
    padding-top: 0.75rem !important;
}

:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div .fi-ta-text {
    padding: 0.5rem 1rem !important;
}

:is(html.dark, .ld-preview--dark) [wire\:id]:has(>.fi-color)>.fi-color+div .fi-ta-text > div {
    gap: 0.75rem !important;
}
```

### 2. Rebuild CSS assets

```bash
cd /var/www/pelican
sudo -u www-data npm run build
```

This regenerates `public/build/assets/theme-*.css` with the new rules.

### 3. Restart

```bash
sudo systemctl restart pelican.service
```

## Key Insight

The `theme-*.css` file name has a hash suffix (e.g., `theme-BZqRdIry.css`). After `npm run build`, the old file is removed and a new one is generated. Do NOT try to edit the old `theme-DoYv7KHc.css` in `public/build/assets/` directly — it will be overwritten on next build.

## Verification

After rebuild, grep the new CSS file to confirm the override exists:

```bash
grep "server list card spacing\|padding.*1.25rem.*1.5rem" /var/www/pelican/public/build/assets/theme-*.css
```
