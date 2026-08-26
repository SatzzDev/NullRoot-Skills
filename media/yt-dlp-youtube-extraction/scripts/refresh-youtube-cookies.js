'use strict';
// Refresh YouTube cookies via headless Chromium using existing cookies.txt
// Usage: node refresh-youtube-cookies.js [output_path]
// Requires: puppeteer-core installed, Chromium at CHROME path, --no-sandbox capable.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_BIN || '/snap/bin/chromium';
const COOKIES_IN = path.join(__dirname, '..', 'api-saturia-codes', 'cookies.txt');
const COOKIES_OUT = process.argv[2] || COOKIES_IN;

function parseNetscape(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const f = t.split('\t');
    if (f.length < 7) continue;
    const [domain, , p, secure, expiry, name, ...rest] = f;
    out.push({
      name,
      value: rest.join('\t'),
      domain: domain.startsWith('.') ? domain : '.' + domain,
      path: p || '/',
      expires: expiry && expiry !== '0' ? Math.floor(Number(expiry)) : undefined,
      secure: secure === 'TRUE',
      httpOnly: false,
    });
  }
  return out;
}

function toNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', ''];
  const future = Math.floor(Date.now() / 1000) + (365 * 24 * 3600);
  for (const c of cookies) {
    const dom = c.domain || '';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expires && c.expires > Date.now() / 1000 ? Math.floor(c.expires) : future;
    lines.push(`${dom}\tTRUE\t${c.path || '/'}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
  }
  return lines.join('\n') + '\n';
}

(async () => {
  const cookies = parseNetscape(COOKIES_IN);
  console.log(`[refresh] loaded ${cookies.length} cookies from ${COOKIES_IN}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Network.setCookies', { cookies });
    console.log('[refresh] injected cookies via CDP');

    await page.goto('https://www.youtube.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('[refresh] youtube home loaded, title:', await page.title());
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('[refresh] video page loaded');
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }); // fixes "page needs to be reloaded"
    console.log('[refresh] video page reloaded');
    await new Promise(r => setTimeout(r, 10000));

    const all = await page.cookies();
    const { cookies: cdpCookies } = await client.send('Network.getAllCookies');
    const merged = new Map();
    for (const c of [...cdpCookies, ...all]) merged.set((c.domain || '') + '|' + c.name, c);
    // keep critical HttpOnly cookies from old set if CDP didn't return them (HSID etc.)
    for (const c of cookies) {
      const key = (c.domain || '') + '|' + c.name;
      if (!merged.has(key)) merged.set(key, c);
    }
    const fresh = [...merged.values()];
    console.log(`[refresh] got ${fresh.length} fresh cookies`);
    fs.writeFileSync(COOKIES_OUT, toNetscape(fresh));
    console.log(`[refresh] wrote ${fresh.length} cookies -> ${COOKIES_OUT}`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('[refresh] ERROR', e); process.exit(1); });
