# Cloudflare DNS via API (no cert/token on VPS)

The VPS has no CF API token or origin cert, so `cloudflared tunnel route dns` fails. Create the
CNAME record with a user-supplied API token (scope: Zone DNS:Edit for `saturia.codes`).

## Get zone ID
```bash
TOKEN="<CF_API_TOKEN>"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=saturia.codes" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'][0]['id'])"
# => ZONE=da7330be07287d137e3be603d85f2617
```

## Create CNAME <sub>.saturia.codes → tunnel
Tunnel ID is in `/etc/cloudflared/config.yml` (first line: `tunnel: <uuid>`).
```bash
TUN="a9521ff9-cdef-422a-a900-6fee7294aa2a"   # from config.yml
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"type\":\"CNAME\",\"name\":\"<sub>.saturia.codes\",\"content\":\"$TUN.cfargotunnel.com\",\"proxied\":true,\"ttl\":1}"
```
`proxied:true` = orange cloud (CF terminates TLS, forwards plain HTTP to localhost). After creating,
restart cloudflared and verify `dig +short <sub>.saturia.codes` returns CF IPs and
`curl -I https://<sub>.saturia.codes` returns 200.

## Note
If the user prefers, they can instead add the public hostname in the CF dashboard (DNS → Add record
→ CNAME → `<sub>` → `<tun>.cfargotunnel.com` → Proxy). Both achieve the same CNAME.
