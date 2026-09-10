import crypto from 'crypto';
import { generateGACookies, generateClarityCookies, generateGStateCookie, generateUUIDLike, generateRandomKey, generateRandomNumber } from './generator';

/**
 * Generate SpotyLoader-style cookies (non-Cloudflare anti-bot)
 * 
 * Structure:
 * hu8935j4i9fq3hpuj9q39=true;          → random key (21 chars) → boolean
 * s9ifs0idfjlwfie32dekl=0;             → random key (21 chars) → counter  
 * _ga_1DWP3TT930=GS2.1.s...;          → Google Analytics 4
 * _ga=GA1.1.1930372661.1789013459;   → Google Analytics client ID
 * sb_main_{md5}=1;                    → Session flag (MD5 key)
 * sb_count_{md5}=N;                   → Session counter (MD5 key)
 * dom3ic8zudi28v8lr6fgphwffqoz0j6c=UUID  → Random key (32 chars) → UUID value
 * vrk4n8fqhwc3jzy7pbsmgt6dx5lha2u9=UUID_2 → Random key (32 chars) → UUID_2 value
 * sb_delay_{md5}=1                    → Delay flag (MD5 key)
 */
function generateSpotyloaderCookies() {
  const now = Math.floor(Date.now() / 1000);
  const randomNum = generateRandomNumber(9);
  const sessionUUID = generateUUIDLike();
  const sessionStart = now - 3600; // 1 jam sebelumnya
  
  // MD5 keys for session flags
  const md5Key1 = crypto.createHash('md5').update(`${now}_session1`).digest('hex');
  const md5Key2 = crypto.createHash('md5').update(`${now}_session2`).digest('hex');
  
  const cookies = {};
  
  // Boolean flags with random 21-char keys
  cookies[generateRandomKey(21)] = 'true';
  cookies[generateRandomKey(21)] = '0';
  
  // Google Analytics
  cookies._ga = `GA1.1.${randomNum}.${now}`;
  cookies._ga_1DWP3TT930 = `GS2.1.s${sessionStart}$o1$g0$t${now}$j60$l0$h0`;
  
  // Session flags (sb_main, sb_count, sb_delay)
  cookies[`sb_main_${md5Key1}`] = '1';
  cookies[`sb_count_${md5Key1}`] = '1';
  
  // UUID cookies with 32-char random keys
  const uuidKey1 = generateRandomKey(32);
  const uuidKey2 = generateRandomKey(32);
  cookies[uuidKey1] = sessionUUID;
  cookies[uuidKey2] = `${sessionUUID}_2`;
  
  // Second session pair (different MD5)
  cookies[`sb_main_${md5Key2}`] = '1';
  cookies[`sb_count_${md5Key2}`] = '3';
  cookies[`sb_delay_${md5Key2}`] = '1';
  
  return cookies;
}

/**
 * Generate ts_session (Cloudflare Turnstile - CANNOT be generated via crypto)
 * This is a placeholder — actual token must be obtained via browser automation
 */
function generateTsSessionPlaceholder() {
  // ❌ This is NOT a valid Turnstile token!
  // ts_session tokens can only be obtained by solving Cloudflare Turnstile
  // via Puppeteer browser automation or a solver service (2Captcha, etc)
  
  // Placeholder format structure (for reference only)
  const timestamp = Math.floor(Date.now() / 1000);
  const fakeToken = crypto.randomBytes(32).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `v1.${timestamp}.${fakeToken}`;
}

/**
 * Generate full SpotyLoader headers with dynamic cookies
 * 
 * IMPORTANT: If target site uses Cloudflare Turnstile:
 * - ts_session MUST be obtained via Puppeteer solve
 * - Use generateTsSessionPlaceholder() ONLY for testing
 */
function generateSpotyloaderHeaders(options = {}) {
  const {
    trackUrl = '',
    includeTsSession = false,
    tsSessionToken = null // Must be obtained via Puppeteer
  } = options;
  
  const cookies = generateSpotyloaderCookies();
  
  // Add ts_session if token provided (from Puppeteer solve)
  if (includeTsSession && tsSessionToken) {
    cookies.ts_session = tsSessionToken;
  }
  
  const cookieString = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  
  return {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "priority": "u=1, i",
    "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "cookie": cookieString,
    "Referer": "https://spotyloader.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
  };
}

/**
 * Generate Cloudflare Bot Management cookies (requires Puppeteer solve)
 * 
 * cf_clearance and __cf_bm CANNOT be generated via crypto
 * Must be obtained by solving Cloudflare challenge via browser automation
 */
function generateCloudflareHeaders(turnstileToken) {
  // ❌ These CANNOT be generated:
  // __cf_bm = Cloudflare Bot Management (requires solving JS challenge)
  // cf_clearance = Cloudflare clearance (requires solving Turnstile)
  // ts_session = Turnstile specific (requires solving Turnstile)
  
  // ✅ These CAN be generated:
  const genCookies = generateCookies();
  const headerCookies = genCookies;
  
  if (turnstileToken) {
    headerCookies.ts_session = turnstileToken;
  }
  
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "connection": "keep-alive",
    "upgrade-insecure-requests": "1",
    "sec-ch-ua": '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "cache-control": "max-age=0",
    "cookie": Object.entries(headerCookies).map(([k,v]) => `${k}=${v}`).join('; ')
  };
}

// Export all utilities
module.exports = {
  generateSpotyloaderCookies,
  generateTsSessionPlaceholder, // FOR TESTING ONLY
  generateSpotyloaderHeaders,
  generateCloudflareHeaders
};

// Example usage:
// const { generateSpotyloaderHeaders, generateSpotyloaderCookies } = require('./spotyloader-generator');
//
// // Generate headers for MusicFab (no Cloudflare)
// const headers = generateSpotyloaderHeaders({
//   referer: 'https://musicfab.io/'
// });
//
// // For SpotyLoader with Turnstile (need Puppeteer for ts_session):
// const tsToken = await solveTurnstilePuppeteer(); // Your Puppeteer solve
// const headers = generateSpotyloaderHeaders({
//   includeTsSession: true,
//   tsSessionToken: tsToken
// });