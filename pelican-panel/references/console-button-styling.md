# Console Button Styling — Pelican Panel

## Changing Button Border Radius in Server Console

Power actions (Start/Restart/Stop/Kill) in the server console are defined in `app/Filament/Server/Pages/Console.php`. Filament buttons can be styled via the `->style()` and `->extraAttributes()` methods.

To add border-radius (rounded buttons), modify the button definition:

```php
// In Console.php, find the button definitions (around lines 185-210)
// Example for the Stop button:
Button::make('stop')
    ->label('Stop')
    ->icon(TablerIcon::PlayerStopFilled)
    ->color('danger')
    ->extraAttributes(['class' => '!rounded-lg'])
```

The `extraAttributes` method accepts arbitrary HTML attributes. Use Tailwind `rounded` classes:
- `rounded` — default border-radius
- `rounded-lg` — larger radius
- `rounded-xl` — extra large
- `rounded-full` — pill/circle
- `!rounded-lg` — override existing utility classes with `!`

## Location
- File: `/var/www/pelican/app/Filament/Server/Pages/Console.php`
- Icon enum: `app/Enums/TablerIcon.php` (uses `tabler-*` classes)
- After editing PHP, **restart queue worker**: `sudo systemctl restart pelican.service`

## Notes
- Filament uses Tailwind CSS utility classes directly.
- Button styling is per-action: `start`, `restart`, `stop`, `kill`, etc.
- Icon changes use `TablerIcon::CaseName` enum, NOT Lucide.
