# Cloudflare Tunnel provisioning from an API token only (no run-token, no cert.pem)

Verified working transcript from a session where the user supplied only a `cfut_...` API token
(`cloudflared:Edit` + `DNS:Edit` perms). Run-token was obtained from the API response, not from the user.

## 1. Account + zone ids
```bash
TOKEN="cfut_xxxxx"   # the API token, Bearer header
ACCT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts?per_page=50" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
ZONE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=satzz.online" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
```

## 2. Create tunnel as LOCAL config (so config.yml ingress works)
```bash
RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel" \
  -d '{"name":"satzz-online","config_src":"local"}')
NEW=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])")
echo "$RESP" | python3 -c "import sys,json;open('/tmp/cf_runtoken.txt','w').write(json.load(sys.stdin)['result']['token'])"
```
The `result.token` here is the real run-token (NOT `cfut_`). Save to `/etc/cloudflared/token`.

## 3. Write /etc/cloudflared/config.yml (sudo tee)
```yaml
tunnel: <NEW>
ingress:
  - hostname: agent.satzz.online
    service: http://localhost:9119
  - service: http_status:404
```

## 4. Install + start service
```bash
TOKEN=$(tr -d '\r\n ' < /tmp/cf_runtoken.txt)
sudo cloudflared service install "$TOKEN"
sudo systemctl daemon-reload && sudo systemctl restart cloudflared
sudo systemctl is-active cloudflared   # -> active
```

## 5. Point DNS (API, because route dns needs cert.pem)
```bash
REC=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?name=agent.satzz.online" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$REC" \
  -d "{\"type\":\"CNAME\",\"name\":\"agent.satzz.online\",\"content\":\"$NEW.cfargotunnel.com\",\"proxied\":true}"
```

## 6. Delete a tunnel (must stop replicas first — else error 1022)
```bash
sudo systemctl stop cloudflared; sleep 10
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel/<id>"
```

## Gotchas
- `cfut_...` = API token. Passing it to `cloudflared service install` => "Provided Tunnel token is not valid."
- Omitting `config_src:"local"` => tunnel is `cloudflare`-managed; `PUT cfd_tunnel/{id}/config` returns 404.
- `cloudflared tunnel route dns` => "Cannot determine default origin certificate path" without `cert.pem`.
- End-to-end check: `curl -sS -o /dev/null -w "%{http_code}\n" https://agent.satzz.online/` should be 302 (login redirect).
