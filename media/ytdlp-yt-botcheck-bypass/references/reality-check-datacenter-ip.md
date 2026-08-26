# Reality check: PoToken alone does NOT bypass a flagged datacenter IP

Learned the hard way on this user's setup (2026-08-20). The base SKILL.md frames
bgutil PoToken as "no paid proxy needed" — that is **misleading for this user** and
this session proved it.

## Verified failure matrix (Azure VM, IP `20.212.168.96`)
| Setup | Video `VECuGvvg7mE` | Video `dQw4w9WgXcQ` (Rick Astley) |
|-------|--------------------|------------------------------------|
| Cookies only (full export) | ❌ bot-check | ✅ 200 (no token) |
| PoToken bgutil only | ❌ bot-check | n/a |
| Cookies + PoToken + `--js-runtimes node` (client `web`) | ❌ bot-check | n/a |
| Cookies + PoToken + node + `player_client=android_vr` | ❌ bot-check | n/a |
| PoToken added to previously-working Rick Astley | — | ❌ **HTTP 403** (regressed!) |
| 10 free public proxies (proxifly/proxyscrape) | ❌ `Host unreachable` / `HTTP 000` | ❌ |

**Conclusion:** the limiting factor is the **egress IP** (Azure datacenter, flagged by
YouTube), not the token. bgutil's own README says: *"Providing a PO token does not
guarantee bypassing 403 errors or bot checks."*

## What actually works / next step
- For reliable downloads from this IP, a **residential or mobile proxy** is still
  required (DataImpulse `gw.dataimpulse.com:823` HTTP / `:824` SOCKS5, $5 free credit,
  auto-rotating; Proxy-Seller from $0.75). PoToken + residential proxy = robust combo.
- Do NOT promise the user "PoToken fixes it." Build the integration, **test against a
  real failing video**, and if it still bot-checks, say so and pivot to proxy — don't
  burn turns fiddling cookies/PoToken context strings.

## Plugin path lesson (if using the bgutil *plugin* instead of manual injection)
- The frozen `/usr/local/bin/yt-dlp` can't take the plugin. If you instead
  `python3 -m venv ytvenv && pip install "yt-dlp>=2025.5.22" bgutil-ytdlp-pot-provider`
  (pip3 absent here; use `python3 -m ensurepip` first — pip 24.0 available), the plugin
  loads, but **JS Challenge Providers all show `unavailable`** until you pass the node
  binary explicitly:
  ```
  yt-dlp --js-runtimes "node:/home/saturia/.hermes/node/bin/node" \
    --extractor-args "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416" ...
  ```
  Without that, Botguard can't run and you still get the bot-check. (Still failed on the
  flagged IP even with this correct, per the matrix above — so proxy is the real fix.)
