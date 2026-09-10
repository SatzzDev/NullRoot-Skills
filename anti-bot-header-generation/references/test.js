import { generateHeaders, generateCookies, cookiesToString } from './generator';
import { generateSpotifyCookies } from './spotify-generator';

// Test the full pipeline
console.log('=== Testing Header Generator ===\n');

console.log('1. Basic Headers (MusicFab style):');
const basicHeaders = generateHeaders({
  referer: 'https://musicfab.io/',
  platform: 'Windows',
  chromeVersion: '152'
});
console.log(JSON.stringify(basicHeaders, null, 2));
console.log('\n');

console.log('2. SpotyLoader Cookies (non-Cloudflare):');
const spotifyCookies = generateSpotifyCookies();
console.log(cookiesToString(spotifyCookies));
console.log('\n');

console.log('3. Headers with GA4 enabled:');
const headersWithGA4 = generateHeaders({
  referer: 'https://example.com/',
  cookieOptions: {
    measurementId: 'GA-TEST123',
    includeGoogleIdentity: false
  }
});
console.log(headersWithGA4.cookie);
console.log('\n');

console.log('=== All tests passed ===');