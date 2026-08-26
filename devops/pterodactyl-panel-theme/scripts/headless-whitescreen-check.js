#!/usr/bin/env node
/*
 * Headless whitescreen / React-mount diagnostic for a Pterodactyl panel.
 *
 * Catches the invisible failures that `curl` + `node --check` miss:
 *   - JS runtime errors thrown before React mounts (e.g. "LucideIcon is not defined")
 *   - empty #app (React crashed during bootstrap)
 *   - failed asset requests
 *
 * Requires puppeteer-core + a system Chromium. The panel's own node_modules can't
 * install puppeteer-core (peer-dep conflict with react 18), so install it in a
 * throwaway dir instead:
 *     mkdir -p /tmp/pptr && cd /tmp/pptr
 *     npm init -y >/dev/null && npm install puppeteer-core@23
 * Then point PPTR_CORE at it (or rely on the default below).
 * Chromium must exist at /snap/bin/chromium (or set CHROME_BIN).
 *
 * Usage:
 *     PPTR_CORE=/tmp/pptr/node_modules/puppeteer-core \
 *     CHROME_BIN=/snap/bin/chromium \
 *     node headless-whitescreen-check.js https://panel.example.com/
 */

const path = require('path');
const pptrCore = require(process.env.PPTR_CORE || '/tmp/pptr/node_modules/puppeteer-core');

const URL = process.argv[2];
if (!URL) {
  console.error('usage: node headless-whitescreen-check.js <panel-url>');
  process.exit(2);
}
const CHROME = process.env.CHROME_BIN || '/snap/bin/chromium';

(async () => {
  const browser = await pptrCore.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()} :: ${r.failure() && r.failure().errorText}`));

  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    errors.push(`[goto-error] ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 5000));

  const appHtmlLen = await page.evaluate(() => {
    const a = document.getElementById('app');
    return a ? a.innerHTML.length : -1;
  });
  const appText = await page.evaluate(() => {
    const a = document.getElementById('app');
    return a ? (a.innerText || '').slice(0, 200) : 'NO #app';
  });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const title = await page.evaluate(() => document.title);

  console.log('=== PAGE / CONSOLE ERRORS ===');
  console.log(errors.join('\n') || '(none)');
  console.log('=== TITLE ===', title);
  console.log('=== #app innerHTML length ===', appHtmlLen);
  console.log('=== #app text (first 200) ===');
  console.log(appText);
  console.log('=== body bg ===', bg);

  const mounted = appHtmlLen > 50;
  const noFatal = !errors.some((e) => /LucideIcon|is not defined|Cannot read|undefined is not/.test(e));
  console.log('=== RESULT:', mounted && noFatal ? 'PASS - app mounted, no fatal JS error' : 'FAIL - see errors above');

  await browser.close();
  process.exit(mounted && noFatal ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
