# Cloudflare DNS and Email Routing via API

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

---

## Email Routing Rules via API

Cloudflare Email Routing lets you create `@saturia.codes` email addresses that forward to a
destination mailbox. The API is under `/email/routing/rules`.

### Required token scope
**Email Routing is NOT included in a Zone DNS:Edit token.** A `cfut_` token must explicitly have
`Email Routing Rules: Edit` (and `Email Routing Addresses: Edit` for new destination addresses)
under the zone permissions. A token with only `#dns_records:edit` + `#zone:read` will return
`{"code":10000,"message":"Authentication error"}` on every email routing endpoint — this is a
missing-scope error, not an invalid-token error.

**How to verify token permissions before attempting email routing:**
```python
import requests
r = requests.get(
    "https://api.cloudflare.com/client/v4/zones?name=saturia.codes",
    headers={"Authorization": f"Bearer {TOKEN}"}
)
zone = r.json()["result"][0]
print(zone["permissions"])  # if '#email_routing:edit' is absent, token lacks scope
```

**Fix**: In CF dashboard → My Profile → API Tokens → edit the token → add permission:
`Zone > Email Routing Rules > Edit` (and `Email Routing Addresses > Edit`), then retry.
Or create a new token with those scopes.

### Check email routing is enabled on the zone
```python
import requests
ZONE = "da7330be07287d137e3be603d85f2617"
r = requests.get(
    f"https://api.cloudflare.com/client/v4/zones/{ZONE}/email/routing",
    headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
)
print(r.json())  # {"result": {"enabled": true, ...}} when active
```
If `enabled: false`, activate via dashboard first: Email → Email Routing → Get Started.

### Create 10 email forwarding rules (acc1@…acc10@saturia.codes)
```python
import requests

TOKEN = "<CF_TOKEN_WITH_EMAIL_ROUTING_SCOPE>"
ZONE  = "da7330be07287d137e3be603d85f2617"
FWD   = "your-real-mailbox@gmail.com"  # destination address (must be verified in CF)
HDRS  = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
BASE  = f"https://api.cloudflare.com/client/v4/zones/{ZONE}/email/routing/rules"

for i in range(1, 11):
    addr = f"acc{i}@saturia.codes"
    payload = {
        "name": f"acc{i}",
        "enabled": True,
        "matchers": [{"type": "literal", "field": "to", "value": addr}],
        "actions":  [{"type": "forward", "value": [FWD]}]
    }
    r = requests.post(BASE, headers=HDRS, json=payload)
    result = r.json()
    status = "✓" if result.get("success") else "✗"
    print(f"{status} {addr}: {result.get('errors') or result.get('result', {}).get('tag','ok')}")
```

### Important constraints
- **Destination address must be verified** in CF Email Routing before rules can forward to it.
  Add it in the dashboard (Email → Email Routing → Destination addresses) or via:
  `POST /zones/{zone}/email/routing/addresses` → triggers a verification email to that address.
- **All 10 rules use the same forward target** — a "send-only" address (no SMTP server on your end)
  is created this way. Each acc1…acc10 address is a receive alias, not a full mailbox.
- **`cfut_` (User API token) vs `cf_` (Global API key)**: use User API tokens (`cfut_`) — scoped and revocable.
- **After any token share, rotate it immediately**: CF dashboard → My Profile → API Tokens → Roll.
