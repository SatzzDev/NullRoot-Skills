# Cloudflare Tunnel: remotely-managed vs locally-managed (CRITICAL)

The saturia VPS tunnel (`a9521ff9-c74b-422a-a900-6fee7294aa2a`, account `76763afb59e192e40d36c92935db20ef`,
zone `da7330be07287d137e3be603d85f2617` for `saturia.codes`) was originally **remotely-managed**:
`cloudflared.service` ran `cloudflared tunnel run --token-file /etc/cloudflared/token`. In this mode the
**edge ingress config lives in Cloudflare's API, NOT in `/etc/cloudflared/config.yml`**. Editing the local
`config.yml` does nothing — requests to a hostname you "added" locally return **Error 1033 / 522** because
the Cloudflare edge has no route for it.

## Symptom → cause
- You add a `hostname:` block to `/etc/cloudflared/config.yml`, restart cloudflared, but the site still 503/1033.
- `dig` shows the hostname resolving to Cloudflare IPs (so DNS is fine) but the edge has no tunnel route.
- Root cause: daemon ignored the local file because it was launched with `--token-file` (remote mode).

## The token vs API-token trap
- The `/etc/cloudflared/token` file is a **tunnel token** (base64 JSON: `a`=account, `t`=tunnel id, `s`=secret).
  It lets the daemon CONNECT. It is NOT a Cloudflare API token and cannot edit ingress/DNS.
- A "CF API token" the user pastes (starts `cfut_…`) is usually also a **tunnel token** unless they explicitly
  made a custom API token with `Account → Cloudflare Tunnel: Edit` + `Zone → DNS: Edit`. Test it:
  `curl -H "Authorization: Bearer <token>" https://api.cloudflare.com/client/v4/user/tokens/verify` →
  if it returns the token's metadata it's an API token; a tunnel token returns `Authentication error 10000`.
- You CANNOT add ingress to a remotely-managed tunnel without a real API token (or dashboard access).

## Migration to locally-managed (so config.yml is honored)
1. Decode the tunnel token to get account/tunnel id/secret:
   `sudo base64 -d /etc/cloudflared/token | jq .`
2. Write `/etc/cloudflared/credentials.json` (chmod 600):
   ```json
   {
     "AccountTag": "<a>",
     "TunnelID": "<t>",
     "TunnelName": "satzz-online",
     "TunnelSecret": "<s>"
   }
   ```
3. Prepend to `/etc/cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /etc/cloudflared/credentials.json
   ingress:
     ...your hostname blocks...
   ```
4. Edit `/etc/systemd/system/cloudflared.service`:
   - Change `ExecStart` to `cloudflared --no-autoupdate --config /etc/cloudflared/config.yml tunnel run`
     **FLAG ORDER MATTERS**: `--config` MUST come BEFORE `tunnel run`. `tunnel run --config X` prints
     help and exits 0 (systemd thinks it failed).
   - Change `Type=notify` → `Type=exec` (or `simple`). `--config` mode does not emit systemd's READY
     notify signal, so `Type=notify` makes systemd report the unit as failed/dead even though it runs.
5. `sudo systemctl daemon-reload && sudo systemctl restart cloudflared`, then verify all hosts.

## DNS record rule for tunnel hostnames
- A Cloudflare Tunnel hostname MUST be a **CNAME → `<tunnelid>.cfargotunnel.com`** (Proxied), NOT an A record.
- An A record (even to a Cloudflare anycast IP like `104.21.x.x`) does NOT route to the tunnel and yields
  timeout/1033. This is easy to miss because `dig` returns Cloudflare IPs either way.
- If a stale A record exists (e.g. `panel.saturia.codes` → `104.21.17.194`), delete it and add the CNAME.
- Verify edge actually serves: `curl -I https://<host>` from the VPS. A 200 from localhost but 1033 from
  the browser almost always means a stale DNS record on the client side or wrong record type, not a down tunnel.

## Verification checklist after any tunnel change
```bash
sudo systemctl is-active cloudflared
curl -s -o /dev/null -w "%{http_code}\n" --max-time 12 https://<host>
curl -s --max-time 12 https://<host> | grep -o '<title>[^<]*</title>'   # confirm real app, not error page
```
