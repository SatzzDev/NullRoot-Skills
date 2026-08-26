# n8n AI Assistant wired to the 9Router gateway (OpenAI-compatible)

This is the working recipe for letting n8n's **AI Assistant → "Connect a model"**
(and the Instance AI model verification) route through the self-hosted 9Router
gateway on this VPS, instead of hitting OpenAI directly.

## Why a proxy is required (root cause, from n8n source)

- n8n `verifyModel` lives in
  `packages/cli/src/modules/instance-ai/instance-ai-verification.service.ts`.
  It calls `generateText({ model: createModel(modelConfig), prompt: 'Reply with OK.', maxOutputTokens: 8 })`
  from the Vercel `ai` SDK. **The SDK expects a JSON chat-completion response.**
- n8n derives the model id in `instance-ai-settings.service.ts → buildModelConfig`:
  `id = \`${CREDENTIAL_TO_MODEL_PROVIDER[type]}/${modelName}\``. For an `openAiApi`
  credential that is `openai/<modelName>` — so whatever the user types in the
  Assistant "Model" box becomes `openai/<model>`.
- **9Router ALWAYS returns SSE streaming** (`data: {...}`) regardless of input,
  and has no stream toggle. n8n's SDK can't parse SSE →
  `classifyFailure` returns `invalid_response` → UI shows
  *"The service returned an unexpected response"* / *"couldn't complete the test"*.
- 9Router also only has Gemini/antigravity providers (`ag/...` models), never
  `gpt-*` / `claude-*`. The fake "GPT-5.6 Sol" the UI suggests does not exist anywhere.

**Fix:** a tiny local proxy that (1) strips the `openai/` prefix so 9Router
receives `ag/...`, and (2) forces `stream:false` (or converts SSE→JSON) so n8n
gets clean JSON. n8n's OpenAI credential points at the proxy, not at 9Router.

## The proxy (9r-proxy.js, listens on 127.0.0.1:5680)

> **Port gotcha:** do NOT use 5679 — n8n itself already binds it. Use 5680.

```js
const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let payload = null;
    try { payload = body ? JSON.parse(body) : null; } catch {}
    if (payload && typeof payload === 'object') {
      if (typeof payload.model === 'string' && payload.model.startsWith('openai/')) {
        payload.model = payload.model.slice('openai/'.length);   // openai/ag/.. -> ag/..
      }
      payload.stream = false;                                    // force JSON, not SSE
      body = JSON.stringify(payload);
    }
    const options = {
      hostname: '127.0.0.1', port: 20128, path: req.url, method: req.method,
      headers: { ...req.headers, 'content-length': Buffer.byteLength(body), host: '127.0.0.1:20128' },
    };
    const proxyReq = http.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        let out = Buffer.concat(chunks);
        const ct = proxyRes.headers['content-type'] || '';
        if (ct.includes('text/event-stream')) {            // belt-and-suspenders SSE->JSON
          try {
            const lines = out.toString('utf8').split('\n')
              .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'));
            out = Buffer.from(JSON.stringify(JSON.parse(lines[lines.length - 1].slice(5).trim())));
            res.setHeader('content-type', 'application/json');
          } catch {}
        }
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        res.end(out);
      });
    });
    proxyReq.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    proxyReq.write(body); proxyReq.end();
  });
});
server.listen(5680, '127.0.0.1', () => console.log('9r-proxy on 5680'));
```

systemd unit `/etc/systemd/system/9r-proxy.service`: `User=saturia`,
`Environment=PATH=/home/saturia/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
`ExecStart=/home/saturia/.hermes/node/bin/node /home/saturia/n8n/9r-proxy.js`,
`Restart=always`, `After=9router.service`.

## Register the n8n credential directly in the DB (encrypted)

n8n encrypts credential `data` with aes-256-cbc using the instance key from
`/home/saturia/n8n/.n8n/.n8n/config` (`{"encryptionKey":"<32+ chars>"}`).
Format (from `n8n-core/dist/encryption/aes-256-cbc.js`):

```
base64( RANDOM_BYTES[53616c7465645f5f] + salt[8] + AES256CBC(plaintext) )
key derivation: password = key + salt; h1=md5(pw); h2=md5(h1+pw);
                 iv=md5(h2+pw); dk=concat(h1,h2)
```

`credentials_entity` columns: `id,name,type,data,createdAt,updatedAt,isManaged,
isGlobal,isResolvable,resolvableAllowFallback`. Share via `shared_credentials`
(`credentialsId,projectId,role`) — use the owner's id from `user` and the
`personal` project id from `project`.

The OpenAI credential to insert:
```json
{ "apiKey": "<9Router Default Key from apiKeys table>",
  "url": "http://127.0.0.1:5680/v1" }
```
(Get the 9Router key: `SELECT key FROM apiKeys WHERE name='Default Key' AND isActive=1`
in `/home/saturia/.9router/db/data.sqlite`.)

## Manual end-to-end verification (no UI/login needed)

```bash
KEY=$(cd /home/saturia/.9router/db && node -e "...")   # pull Default Key
curl -sS -X POST http://127.0.0.1:5680/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"openai/ag/gemini-3.7-flash-medium","messages":[{"role":"user","content":"Reply with OK."}],"max_tokens":8,"stream":false}'
# -> {"object":"chat.completion","choices":[{"message":{"content":"OK."}...}]}
```
If that returns clean JSON, the Assistant "Connect a model" test will pass.

## In the n8n web UI

1. Settings → Credentials → **9Router-Gateway** (type OpenAI) is already present.
2. AI Assistant → Connect a model → pick **9Router-Gateway**, Model:
   **`ag/gemini-3.7-flash-medium`** (or `ag/gemini-3.7-flash-high`).
   Never `gpt-*`/`claude-*` — 9Router has no such provider.
3. Connect → succeeds (proxy strips `openai/`, forces JSON).

## To add OpenAI/Claude to the gateway

Insert the provider's real API key into 9Router's `providerConnections` table
(or add via UI), then n8n can use `openai/gpt-4o` etc. through the same proxy.
