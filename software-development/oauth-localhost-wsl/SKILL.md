---
name: oauth-localhost-wsl
description: Connect localhost-OAuth services to Hermes in WSL2.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [spotify, oauth, wsl2, pkce, hermes, auth]
    related_skills: [hermes-agent, edit-pterodactyl-bot]
---

# Localhost-callback OAuth for Hermes in WSL2

Use when the user wants to connect a service that uses a localhost redirect OAuth
flow (Spotify is the common one) to the Hermes agent running inside this WSL2 host.

## When to Use
- User says "connect Spotify to Hermes", "set up Spotify", or pastes a Spotify
  Client ID / credentials.
- Any localhost-callback OAuth where the agent runs in WSL2 but the user may be
  on a different physical machine.

## Working method (the only one that succeeded this session)
1. Run the auth command **in the WSL terminal on the SAME machine whose browser
   will do the redirect**:
   `hermes auth spotify`
2. Hermes prints an authorize URL. **Open that URL in a browser on the same
   machine** (the one hosting WSL). The Spotify redirect hits `127.0.0.1:43827`
   on WSL loopback directly → Hermes catches it → token saved to `~/.hermes/auth.json`.
3. Verify: `hermes auth status spotify` → "logged in".

That is it. Do NOT attempt cross-machine plumbing (see pitfalls).

## Key facts (Spotify specifically)
- Env var is `HERMES_SPOTIFY_CLIENT_ID` in `~/.hermes/.env` (PKCE flow — NO client
  secret needed; a secret is ignored).
- Default redirect URI `http://127.0.0.1:43827/spotify/callback` MUST be
  allow-listed in the Spotify app (dashboard → app → Settings → Redirect URIs).
- Spotify's dashboard **rejects `localhost`** as a redirect ("unsafe") — use
  `127.0.0.1` with explicit port.
- Playback (play/pause/skip/volume) needs **Premium + an active Spotify device**
  (open Spotify on phone/desktop/web player). Read-only tools work on Free.
- 7 tools appear only after `hermes tools` enables spotify (it was enabled this session).

## Pitfalls (all hit and debugged this session)
- **Pasting the auth code to the agent is a DEAD END for PKCE.** The code alone
  cannot be exchanged — the server holds a `code_verifier` in memory. The browser
  redirect MUST reach the running `hermes auth spotify` server. Tell the user to
  just click the URL; never ask them to paste `code=` / `state=` back.
- **WSL2 loopback isolation:** a browser on a *different* machine (e.g. user on
  laptop baru, Hermes on laptop lama) redirects to *that machine's* `127.0.0.1`,
  which is NOT WSL's loopback → callback never arrives → "timed out waiting for
  the local callback". Cross-machine fixes that FAILED: Windows `netsh portproxy`
  (needs Admin), nginx proxy on :80, SSH `-L` tunnel, switching redirect to
  `localhost`. Only "run auth where the browser is" works.
- **Lingering `hermes auth spotify` processes hold port 43827** → next run errors
  `Address already in use`. Free it: `sudo fuser -k 43827/tcp` (or `kill <pid>`).
- **Long chat commands exceed the 180s foreground timeout.** Creating a playlist
  + searching 30 tracks + adding + shuffle + play timed out. Run such multi-step
  Spotify actions with `background=true` + `notify_on_complete=true`.
- Scraping a kworb chart: titles live in `<td class="text mp">` cells; parse with a
  tiny Python regex (`re.findall(r'class="text mp"[^>]*>(.*?)</td>', data, re.S)`)
  then strip tags — grep alone misses nested content.

## Verify
`hermes auth status spotify` → confirm "logged in" + scope includes
`user-modify-playback-state`. Then a real playback call (e.g. play a known track
URI) confirms the device path.
