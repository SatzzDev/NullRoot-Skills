---
name: anti-bot-header-generation
description: Use when generating headers to bypass analytics cookies.
version: 1.0.0
author: Saturia
created: 2026-09-10
---

# Anti-Bot Header Generation

Generate realistic browser headers and cookies to bypass anti-bot protection systems like Google Analytics, Microsoft Clarity, and browser fingerprinting — **without** needing Puppeteer or browser automation.

## When to Use

✅ **Use this skill when:**
- Target site uses Google Analytics (`_ga`, `_ga_*`)
- Site tracks with Microsoft Clarity (`_clck`, `_clsk`)
- API requires Client Hints headers (`sec-ch-ua-*`)
- Fetch metadata headers needed (`sec-fetch-*`)
- **NO Cloudflare Turnstile** (`ts_session`)
- **NO Cloudflare Bot Management** (`__cf_bm`, `cf_clearance`)

❌ **Do NOT use when:**
- Site uses Cloudflare Turnstile → use Puppeteer instead
- `__cf_bm` or `cf_clearance` cookies present → need browser automation
- reCAPTCHA/hCaptcha visible → need solver service

## Cookie Types

### Google Analytics

**`_ga` (Client ID):**
```
GA1.1.{random_9_digits}.{unix_timestamp}
```

**`_ga_{MEASUREMENT_ID}` (GA4 Session):**
```
GS2.1.s{session_start_ts}$o1$g0$t{last_event_ts}$j{session_count}$l0$h{session_id}
```

### Microsoft Clarity

**`_clck` (User ID):**
```
{base64_random}%5E{version}%5E{flags}%5E0%5E{counter}
```

**`_clsk` (Session):**
```
v1{base64_random}%5E{timestamp_ms}%5E{session_num}%5E{page_num}%5Er.clarity.ms%2Fcollect
```

### Google Identity

**`g_state` (OAuth state):**
```json
{
  "i_l": 0,
  "i_ll": {timestamp_ms},
  "i_b": "{base64_token}",
  "i_e": {"enable_itp_optimization": 24},
  "i_et": {timestamp_ms}
}
```

## Browser Headers

### Client Hints (Chrome)

```javascript
"sec-ch-ua": '"Chromium";v="{version}", "Not?A_Brand";v="24", "Google Chrome";v="{version}"'
"sec-ch-ua-mobile": "?0"  // desktop
"sec-ch-ua-platform": '"Windows"'  // or "macOS", "Linux"
```

### Fetch Metadata

```javascript
"sec-fetch-dest": "empty"     // API call
"sec-fetch-mode": "cors"      // cross-origin
"sec-fetch-site": "same-origin" // or "same-site", "cross-site"
```

## Implementation

See `references/generator.js` and `references/generator.py` for full implementations.

## Usage Examples

### Example 1: MusicFab API

```javascript
import { generateHeaders } from './headerGenerator';

async function spotifyDL(url) {
  const headers = generateHeaders({
    referer: 'https://musicfab.io/',
    platform: 'Windows',
    chromeVersion: '152'
  });
  
  const response = await fetch('https://musicfab.io/api/spotify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ url })
  });
  
  return await response.json();
}
```

### Example 2: Custom Cookie Set

```javascript
import { generateCookies } from './headerGenerator';

const cookies = generateCookies({
  includeGA: true,
  includeClarity: true,
  includeGoogleIdentity: false,
  measurementId: 'JQSCTHPS4E'
});
```

### Example 3: Dynamic per Request

```javascript
for (let i = 0; i < 100; i++) {
  const headers = generateHeaders(); // Fresh identity each time
  await fetch(url, { headers });
}
```

## Verification

1. **Browser DevTools:**
   - Open target site in Chrome
   - DevTools → Network → Select API request
   - Compare generated headers with real browser

2. **Test Endpoint:**
   ```javascript
   const response = await fetch(url, { headers: generatedHeaders });
   if (response.status === 403) {
     console.log('❌ Headers rejected');
   } else if (response.status === 200) {
     console.log('✅ Headers accepted');
   }
   ```

3. **Monitor for 403/429:**
   - 403 Forbidden → headers rejected, might need Puppeteer
   - 429 Too Many Requests → rate limit, add delays
   - 200 OK → working!

## Troubleshooting

### Headers Rejected (403)

**Possible causes:**
1. Site uses Cloudflare → check for `__cf_bm` in real browser
2. Missing required header → compare with real request
3. Wrong `sec-ch-ua` version → update Chrome version number
4. Wrong `sec-fetch-site` value → check if same-origin/same-site/cross-site

**Solutions:**
- Add more headers from real browser
- Use Puppeteer for Cloudflare-protected sites
- Rotate User-Agent strings
- Add realistic delays between requests

### Cookies Expire Too Fast

**Solution:** Regenerate cookies every N minutes:
```javascript
let cachedHeaders = null;
let lastGenerated = 0;

function getHeaders() {
  const now = Date.now();
  if (!cachedHeaders || now - lastGenerated > 300000) { // 5 min
    cachedHeaders = generateHeaders();
    lastGenerated = now;
  }
  return cachedHeaders;
}
```

### Rate Limited (429)

**Solution:** Add exponential backoff:
```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    
    const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Max retries exceeded');
}
```

## Security Notes

1. **Do NOT use for:**
   - Bypassing authentication
   - Unauthorized access
   - Terms of Service violations

2. **Respect rate limits:**
   - Add delays between requests
   - Monitor 429 responses
   - Use exponential backoff

3. **Privacy:**
   - Generated cookies are random, not linked to real users
   - Safe to use for legitimate scraping

## Related Skills

- `puppeteer-cloudflare-bypass` — for Turnstile/Bot Management
- `web-scraping-best-practices` — ethical scraping guidelines

## References

- [Chrome Client Hints](https://web.dev/user-agent-client-hints/)
- [Fetch Metadata](https://web.dev/fetch-metadata/)
- [Google Analytics Cookie Format](https://developers.google.com/analytics/devguides/collection/analyticsjs/cookie-usage)
- [Microsoft Clarity Tracking](https://docs.microsoft.com/en-us/clarity/)
