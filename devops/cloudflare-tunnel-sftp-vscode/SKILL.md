---
name: cloudflare-tunnel-sftp-vscode
description: Expose SFTP over Cloudflare Tunnel for VSCode access.
version: 0.1.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Cloudflare, Tunnel, SFTP, SSH, VSCode, Pterodactyl]
---

# Cloudflare Tunnel → SFTP for VSCode

Expose an SSH/SFTP endpoint through an existing Cloudflare Tunnel so you can edit
remote files (e.g. Pterodactyl bot volumes) from VSCode on another machine
without opening inbound ports. It does NOT cover creating a brand-new tunnel via
the API or the GUI login flow (see skill `pterodactyl-wings-bot-ops`, reference
`references/cloudflare-tunnel-api.md`); this skill assumes a tunnel already
exists and you only add an `ssh://` ingress + DNS route.

## When to Use
- "sftp di pterodactyl gak bisa dipakai" / "mau akses sftp di vscode"
- "pakai cloudflare tunnel lah" for SSH/SFTP access
- Need to edit files on a NAT/CGNAT host (no inbound ports) from an external editor
- Any time you must reach `localhost:22` on a WSL/remote box from outside

## Prerequisites
- `cloudflared` installed (`/usr/local/bin/cloudflared`).
- An existing named tunnel with its credentials file + `config.yml`.
  (This host: tunnel ID `7b1920df-f6b0-4aa0-9ed8-302ca809a496`, config at
  `/home/satzz/.cloudflared/config.yml`, creds `…7b1920df….json`.)
- SSH server running and listening on `:22` (`sudo systemctl status ssh`).
- Zone already managed in Cloudflare (here `satzz.online`); the tunnel token
  only edits that one zone.

## How to Run
All steps invoke through the `terminal` tool. Run as the normal user (not root)
for the cloudflared/config files; use `sudo` only for daemon/service control and
file ownership fixes.

## Quick Reference
- Register DNS: `cloudflared tunnel route dns <TUNNEL_ID> sftp.<domain>`
- Tunnel config ingress: `- hostname: sftp.<domain>` / `service: ssh://localhost:22`
- ProxyCommand: `cloudflared access tcp --hostname sftp.<domain> --destination localhost:22`
- SSH key: `ssh-keygen -t ed25519 -f ~/.ssh/satzz_sftp_key -N ""`
- Pterodactyl volume owner: `sudo chown -R 999:983 <volume>/`
- Path-traversal perms: `sudo chmod 755 /var/lib/pterodactyl /var/lib/pterodactyl/volumes` + `sudo chmod -R o+rX <volume>/`

## Procedure
1. **Inspect existing tunnel** — confirm cloudflared is present and a config exists:
   ```bash
   which cloudflared
   sudo cat /etc/cloudflared/config.yml      # or /home/satzz/.cloudflared/config.yml
   cloudflared tunnel list                   # note the TUNNEL_ID + name
   ```
2. **Add the SFTP ingress** to the config `ingress:` block (put it FIRST so it
   matches before the `http_status:404` fallback):
   ```yaml
   ingress:
     - hostname: sftp.satzz.online
       service: ssh://localhost:22
     - hostname: panel.satzz.online
       service: https://localhost:443
       originRequest: { noTLSVerify: true }
     - service: http_status:404
   ```
3. **Register the DNS CNAME** (this is what makes `sftp.<domain>` resolvable —
   `cloudflared` alone will NOT auto-create it):
   ```bash
   cloudflared tunnel route dns <TUNNEL_ID> sftp.satzz.online
   # → "Added CNAME sftp.satzz.online which will route to this tunnel"
   ```
   Wait 1–2 min for propagation. Verify: `python3 -c "import socket;print(socket.gethostbyname('sftp.satzz.online'))"`.
4. **Run the tunnel** as a systemd service so it survives reboots (preferred over
   a bare `cloudflared … run` in a terminal, which dies when the session ends).
   Use the unit file in `references/sftp-tunnel.service`:
   ```bash
   sudo cp references/sftp-tunnel.service /etc/systemd/system/cloudflared-sftp.service
   sudo systemctl daemon-reload && sudo systemctl enable --now cloudflared-sftp
   ```
   Kill any stray `cloudflared` processes first to avoid duplicate connectors:
   `kill -9 $(pgrep -f cloudflared)` (then let systemd restart the right one).
5. **SSH key + authorized_keys** (passwordless so VSCode won't prompt):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/satzz_sftp_key -N ""
   cat ~/.ssh/satzz_sftp_key.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys; chmod 700 ~/.ssh
   sudo service ssh restart
   ```
6. **SSH client config** — add the block from `references/ssh-config` to
   `~/.ssh/config`. The `ProxyCommand` routes through the tunnel; `cloudflared
   access tcp` handles IPv4/IPv6 fallback so you don't need an AAAA hack.
7. **Test SSH**: `ssh -F ~/.ssh/config sftp-shiroko "echo SSH_OK"`.
8. **Test SFTP**: `sftp -F ~/.ssh/config sftp-shiroko` then `ls /home/satzz/`.
9. **Fix volume permissions** if you'll SFTP into Pterodactyl volumes (see Pitfalls).
10. **VSCode**: use the Remote-SSH extension → Connect to Host `sftp-shiroko`,
    OR the SFTP extension with `sftp.json`:
    ```json
    {
      "host": "sftp.satzz.online", "port": 22, "username": "satzz",
      "privateKey": "C:/Users/satzz/.ssh/satzz_sftp_key",
      "remotePath": "/home/satzz/selfbot-vol",
      "proxyCommand": "cloudflared access tcp --hostname sftp.satzz.online --destination localhost:22"
    }
    ```
    (On Windows, `cloudflared` must also be installed locally for `proxyCommand`.)

## Pitfalls
- **NEVER `chown -R satzz:satzz` a Pterodactyl volume.** Containers run as UID
  `999` (GID `983`). Changing ownership to your user breaks the bot
  (`EACCES: permission denied, open 'session/creds.json'`) and can even make
  Wings drop the volume. Always use `sudo chown -R 999:983 <volume>/`.
- **Symlinks into root-owned volumes give "Permission denied"** even after the
  volume is `999:983`, because every parent dir in the path needs execute. Fix:
  `sudo chmod 755 /var/lib/pterodactyl /var/lib/pterodactyl/volumes` and
  `sudo chmod -R o+rX <volume>/`. Then `ln -sf <volume> ~/selfbot-vol`.
- **IPv6 / AAAA "network is unreachable"**: `cloudflared access tcp` negotiates
  the reachable edge automatically — prefer it over `access ssh`, and don't hand
  `ssh -4` (it doesn't affect the ProxyCommand's own DNS). If you must pin IPv4,
  set `HostName 127.0.0.1` + the `cloudflared access tcp` ProxyCommand.
- **DNS not resolving right after `route dns`**: wait 1–2 min; Cloudflare needs
  to publish the CNAME. `dig sftp.<domain> A` may lag while `AAAA` shows first.
- **Multiple cloudflared processes conflict** (duplicate connectors, flapping).
  Keep ONE: the systemd service. Kill strays with `kill -9 $(pgrep -f cloudflared)`.
- **`cloudflared access ssh` vs `access tcp`**: use `access tcp
  --destination localhost:22` for the SSH/SFTP ProxyCommand; `access ssh` is a
  thin wrapper that hit IPv6 issues here.
- **VSCode error `node.satzz.online: Timed out while waiting for handshake`**:
  the SFTP extension is pointing at the Wings daemon (`:8080` HTTP), NOT the
  tunnel. Change its `host` to `sftp.satzz.online` / `sftp-shiroko`.
- **Tunnel token only edits `satzz.online`**: creating DNS via the Cloudflare
  REST API fails with `Authentication error` (scoped token). Use
  `cloudflared tunnel route dns` instead — it authenticates with the tunnel creds.

## Verification
A single command proves the whole chain works:
```bash
ssh -F ~/.ssh/config sftp-shiroko "ls /home/satzz/selfbot-vol/commands/ | head"
```
Expected: a file listing (e.g. `ai.js backup.js …`), no password prompt, no
"permission denied". If it returns `SSH_OK`/listing, SFTP in VSCode will too.
