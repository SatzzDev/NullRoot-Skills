---
name: web-visual-verification
description: "Use for web layout bugs: measure rendered pixels headless."
version: 1.0.0
author: Hermes
platforms: [linux]
metadata:
  hermes:
    tags: [frontend, css, headless, chromium, verification, layout, debugging]
    related_skills: [dogfood, frontend-design, inspecting-hermes-desktop-dom]
---

# Web Visual Verification

Verify that a self-hosted web page actually RENDERS the way its code says —
before claiming a fix, and the moment a user reports a visual bug.

## When to Use

- User reports a layout bug ("too close", "nempel", "overlapping", "still
  looks wrong") on a page you built or maintain.
- After any CSS/HTML edit that must change geometry: confirm it's live AND
  applied.
- Before telling the user a visual fix is done.

## The iron rule: measure the render, not the source

`curl | grep` proving the CSS text is served proves NOTHING about pixels.
Specificity overrides, browser cache, and CDN cache can all make served CSS ≠
applied CSS. When a visual complaint survives a code fix, get rendered
geometry BEFORE touching any value again.

## Workflow

1. **Confirm deploy**: `curl -sS <url> | grep -o '<the new rule>'` plus cache
   headers (`cache-control`, `cf-cache-status`, `last-modified`). If the rule
   is served but the user still sees the old state → tell them hard refresh
   (`Ctrl+Shift+R`) / incognito. Do NOT make more code changes.
2. **Measure the render** with the recipe below. Exact pixel gaps settle
   disputes that screenshots and vision estimates can't.
3. **Fix based on the numbers**, then re-measure to confirm.
4. **Screenshot as user evidence**: render the live URL to a PNG in $HOME and
   attach via `MEDIA:`.

## Measure recipe (exact pixel gaps)

Copy the page locally, inject a load-time script that writes measurements
into the DOM, then `--dump-dom` + grep:

```bash
cp /path/to/page.html $HOME/measure.html
python3 - $HOME/measure.html <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
inj = '''<script>
window.addEventListener('load',()=>{
 const nav=document.querySelector('nav').getBoundingClientRect();
 const eye=document.querySelector('.eyebrow').getBoundingClientRect();
 const h1=document.querySelector('h1').getBoundingClientRect();
 const m={gap_nav_eye:Math.round(eye.top-nav.bottom),gap_eye_h1:Math.round(h1.top-eye.bottom)};
 const d=document.createElement('div');d.textContent='MEASURE:'+JSON.stringify(m);
 d.style.cssText='position:fixed;top:0;left:0;background:red;color:white;z-index:999;font:14px monospace';
 document.body.appendChild(d);
});
</script>'''
open(p, 'w').write(s.replace('</body>', inj + '\n</body>'))
EOF
chromium-browser --headless=new --disable-gpu --no-sandbox \
  --window-size=1280,1000 --virtual-time-budget=8000 \
  --dump-dom "file://$HOME/measure.html" 2>/dev/null | grep -o 'MEASURE:{[^<]*'
```

Adapt the selectors to the elements in question. `--virtual-time-budget`
makes the load handler fire under headless dump. For the LIVE page, point the
screenshot flag at the URL instead (measurement needs the local-copy trick or
a browser-exec session).

Screenshots:

```bash
chromium-browser --headless=new --disable-gpu --no-sandbox \
  --window-size=1280,1400 --screenshot=$HOME/page-check.png "https://example.com/"
```

## Pitfalls

- **Class beats element selector — the silent padding collapse.**
  `<header class="wrap">` with `.wrap{padding:0 24px}` overrides
  `header{padding:140px 0 64px}` (specificity 0,1,0 > 0,0,1). Symptom: ALL
  vertical padding on class-carrying elements collapses to 0; text sticks to
  the nav; bumping the element-selector value does nothing no matter how high
  you go. Fix: compound selector `header.wrap{padding:140px 24px 64px}` (and
  same for `section.wrap` etc.). When padding "doesn't apply", grep for a
  class rule hitting the same element BEFORE raising values. (Real case:
  api.saturia.codes landing, 2026-08: three value bumps wasted; measurement
  showed `gap_nav_eye:0` instantly.)
- **User repeating the same complaint = your last fix didn't render.** Stop
  bumping values. Run the measure recipe first.
- **vision_analyze pixel estimates are unreliable for spacing verdicts.** It
  reported ~6-8px gaps while CSS said 140px — image-based estimation is
  guesswork. Use vision for "does it look broken / what's where", never for
  "how many pixels". DOM measurement is the arbiter.
- **snap chromium cannot write /tmp** (sandboxed mount namespace): stderr
  says "N bytes written to file /tmp/x.png" but the file does not exist.
  Always screenshot/dump to `$HOME` (or the project dir).
- **Use `--headless=new`**; old-style `--headless` can exit without producing
  the file. dbus/AppArmor/GCM errors in stderr are noise — judge by the
  output file.
- **Static files need no service restart** (express.static etc.) — but DO
  re-curl the live URL after editing; a typo in the rule name is invisible
  without it.

## Done criteria

A visual fix is complete only when: (1) curl shows the rule served, (2)
dump-dom measurement shows the expected geometry, (3) a screenshot of the
live page was attached for the user.
