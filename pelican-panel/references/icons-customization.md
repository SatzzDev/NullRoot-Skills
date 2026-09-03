## Icons & Customization

### Key fact
Pelican Filament admin uses Tabler icons via the App\Enums\TablerIcon enum. Values are tabler-* class strings (e.g. tabler-player-stop-filled). There is NO Lucide or Heroicons enum in this codebase. When the user mentions Lucide they almost always want a different Tabler icon, not an actual Lucide swap.

### Where server-console power icons live
app/Filament/Server/Pages/Console.php contains an ActionGroup of start/restart/stop/kill actions, each with ->icon(TablerIcon::CaseName).

The stop action uses TablerIcon::PlayerStopFilled. Swap that case to change the stop icon. The kill action uses TablerIcon::AlertSquare.

### Picking a replacement icon
The enum has thousands of cases. Grep for the icon family you want:

  grep -n "PlayerStop\|Square\|CircleStop\|Ban\|Forbid" app/Enums/TablerIcon.php

Relevant cases:
  PlayerStopFilled   = tabler-player-stop-filled
  PlayerStop         = tabler-player-stop
  CircleStop         = tabler-circle-stop
  CircleStopFilled   = tabler-circle-stop-filled
  Square             = tabler-square
  SquareFilled       = tabler-square-filled
  AlertSquare        = tabler-alert-square
  Ban                = tabler-ban

### Swap procedure
1. Edit app/Filament/Server/Pages/Console.php.
2. Replace the TablerIcon::CaseName on the target action with the new case.
3. No migration, rebuild, or cache clear required - icons resolve at render time via the tabler-* CSS class.

### Gotchas
- Do NOT change the enum itself. Swap the reference in the Action, not the enum definition.
- If the icon does not appear, confirm the case exists in app/Enums/TablerIcon.php (typo gives a null icon, not a crash).
- Deepfield theme injects CSS targeting fi-btn and tabler icon classes inside the console (e.g. [class*="player-play"]). A renamed stop icon may need a matching CSS selector update in public/plugins/deepfield/deepfield.css if theme styling keyed off the old icon class.
