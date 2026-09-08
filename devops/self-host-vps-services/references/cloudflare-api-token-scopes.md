# Cloudflare API Token Scope Pitfalls

## Token scope must be set at creation time

Cloudflare API tokens are **immutable after creation**. Editing an existing token in the dashboard (adding/removing scopes) does NOT regenerate the token string — the `cfut_...` string stays the same, and API calls continue to use the OLD scopes.

**Symptom**: User says "I updated the token permissions" but API calls still return `Authentication error` or HTTP 403 with missing scope errors.

**Fix**: Create a **new token** with the correct scopes. The dashboard only shows the token string ONCE at creation (with a "copy" button) — if you miss it, you cannot retrieve it later and must create another new token.

## Required scopes by task

### Cloudflare Tunnel public hostname registration
- **Via dashboard** (Cloudflare Zero Trust → Networks → Tunnels → Public Hostnames): no token needed, user must do it manually
- **Via `cloudflared tunnel route dns`**: requires `Zone DNS:Edit` + `Cloudflare Tunnel:Edit` (account-level)

### Email Routing (create routing addresses)
- `Email Routing Rules:Edit` (zone-level)
- `Zone:Read` (to list zones and get zone ID)

### DNS record management
- `Zone DNS:Edit` (zone-level)
- `Zone:Read`

### General debugging: verify token scopes
Call the token verification endpoint:
```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer cfut_..." | jq '.result'
```
The `result.policies` array shows what scopes the token actually has.

## Token types

- **API Token** (`cfut_...` or `cf_...`) — scoped, can be restricted to specific zones/accounts, preferred for automation
- **Tunnel Run Token** (long JWT, `{"a":...,"t":"<tunnel-id>"}`) — embedded in `/etc/cloudflared/token`, only for starting tunnel connector, NOT usable for CF API calls
- **Origin CA Certificate** (`cert.pem`) — legacy method for tunnel DNS management, not present on this VPS

Do NOT try to use a tunnel run token for API calls — it will fail with "Invalid request headers".
