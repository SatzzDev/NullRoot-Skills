# Critical Pitfall: AdminLTE rem = 10px, NOT 16px

## The problem
AdminLTE sets `html { font-size: 10px }` as the rem base, NOT the browser
default of 16px. This means any `rem` unit in `saturiahost-admin.css` is
interpreted at **10px per rem**, making everything tiny:

| Intended (1rem=16px) | Actual (1rem=10px in AdminLTE) |
|-----------------------|-------------------------------|
| `0.95rem` = 15.2px    | `0.95rem` = **9.5px** (tiny!)  |
| `0.88rem` = 14.08px   | `0.88rem` = **8.8px** (tiny!)  |
| `1.05rem` = 16.8px    | `1.05rem` = **10.5px** (tiny!) |

## Rule
**Never use `rem` units in `saturiahost-admin.css`.** Use `px` values directly.
If converting from a design that used `rem` at the 16px standard, multiply
by 16:

- `0.95rem` → `15.2px`
- `0.88rem` → `14.08px`
- `1.05rem` → `16.8px`
- `1.7rem` → `27.2px`

## Conversion script
```python
import re
with open("saturiahost-admin.css") as f:
    css = f.read()
def rem_to_px(match):
    val = float(match.group(1))
    px = val * 16  # 1rem = 16px (browser default, intended design ratio)
    if px == int(px):
        return f"{int(px)}px"
    return f"{px}px"
css_fixed = re.sub(r'([\d.]+)rem', rem_to_px, css)
with open("saturiahost-admin.css", "w") as f:
    f.write(css_fixed)
```

## Discovery log (2026-08-25)
Buttons appeared tiny (font=9.5px, padding=6.5px 16px) despite CSS being
loaded and rules matching via DevTools. The root cause was that all `rem`
values in the CSS were designed for the standard browser 1rem=16px, but
AdminLTE overrides `html { font-size: 10px }`, so `0.95rem` = `9.5px`
instead of the intended `15.2px`.
