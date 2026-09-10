import crypto from 'crypto';

/**
 * Generate random number with specified digit count
 */
function generateRandomNumber(digits = 9) {
  return Math.floor(Math.random() * Math.pow(10, digits));
}

/**
 * Generate base64 random string (URL-safe)
 */
function generateBase64Random(byteLength = 16) {
  return crypto.randomBytes(byteLength)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate UUID v4-like string
 */
function generateUUIDLike() {
  const hex = crypto.randomBytes(16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

/**
 * Generate random alphanumeric key
 */
function generateRandomKey(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(length))
    .map(byte => chars[byte % chars.length])
    .join('');
}

/**
 * Generate Google Analytics cookies
 */
function generateGACookies(measurementId) {
  const now = Math.floor(Date.now() / 1000);
  const randomNum = generateRandomNumber(9);
  
  // GA Client ID
  const ga = `GA1.1.${randomNum}.${now}`;
  
  // GA4 Session ID (optional)
  const sessionId = generateRandomNumber(9);
  const ga4 = measurementId 
    ? `_ga_${measurementId}=GS2.1.s${now}$o1$g0$t${now}$j56$l0$h${sessionId}`
    : null;
  
  return {
    _ga: ga,
    ...(ga4 && { [`_ga_${measurementId}`]: ga4 })
  };
}

/**
 * Generate Microsoft Clarity cookies
 */
function generateClarityCookies() {
  const now = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  
  const clarityId = generateBase64Random(12);
  
  const _clck = `${clarityId}%5E2%5Eg9c%5E0%5E2444`;
  const _clsk = `v1${generateBase64Random(6)}%5E${nowMs}%5E1%5E1%5Er.clarity.ms%2Fcollect`;
  
  return { _clck, _clsk };
}

/**
 * Generate Google Identity state cookie
 */
function generateGStateCookie() {
  const nowMs = Date.now();
  const token = generateBase64Random(32);
  
  const gState = {
    i_l: 0,
    i_ll: nowMs,
    i_b: token,
    i_e: { enable_itp_optimization: 24 },
    i_et: nowMs
  };
  
  return { g_state: encodeURIComponent(JSON.stringify(gState)) };
}

/**
 * Generate all cookies for browser simulation
 */
function generateCookies(options = {}) {
  const {
    includeGA = true,
    includeGA4 = false,
    measurementId = 'JQSCTHPS4E',
    includeClarity = true,
    includeGoogleIdentity = false
  } = options;
  
  let cookies = {};
  
  if (includeGA) {
    Object.assign(cookies, generateGACookies(measurementId));
  }
  
  if (includeGA4) {
    const now = Math.floor(Date.now() / 1000);
    const sessionId = generateRandomNumber(9);
    cookies._ga = cookies._ga; // Keep same GA cookie
    cookies[`_ga_${measurementId}`] = `GS2.1.s${now}$o1$g0$t${now}$j56$l0$h${sessionId}`;
  }
  
  if (includeClarity) {
    Object.assign(cookies, generateClarityCookies());
  }
  
  if (includeGoogleIdentity) {
    Object.assign(cookies, generateGStateCookie());
  }
  
  return cookies;
}

/**
 * Convert cookies object to cookie string
 */
function cookiesToString(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Generate realistic browser headers
 */
function generateHeaders(options = {}) {
  const {
    referer = 'https://example.com/',
    platform = 'Windows',
    chromeVersion = '152',
    userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`,
    includeCookies = true,
    cookieOptions = {}
  } = options;
  
  const headers = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    ...(includeCookies && { "cookie": cookiesToString(generateCookies({
      includeGA: true,
      includeGA4: true,
      measurementId: cookieOptions.measurementId || 'JQSCTHPS4E',
      includeClarity: true,
      includeGoogleIdentity: cookieOptions.includeGoogleIdentity || false
    })) }),
    "origin": referer.replace(/\/$/, ''),
    "referer": referer,
    "user-agent": userAgent,
    // Client Hints
    "sec-ch-ua": `"Chromium";v="${chromeVersion}", "Not?A_Brand";v="24", "Google Chrome";v="${chromeVersion}"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"${platform}"`,
    // Fetch Metadata
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    // Navigation Hints
    "priority": "u=1, i"
  };
  
  return headers;
}

// Export all utilities
module.exports = {
  generateRandomNumber,
  generateBase64Random,
  generateUUIDLike,
  generateRandomKey,
  generateGACookies,
  generateClarityCookies,
  generateGStateCookie,
  generateCookies,
  cookiesToString,
  generateHeaders
};