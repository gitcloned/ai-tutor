/**
 * get-session.mjs
 *
 * Step 1 of the KA import pipeline.
 * Opens a real browser (Playwright) once to pass KA's bot detection,
 * captures session cookies + the exact GraphQL request signature,
 * and saves them to ka-session.json for reuse by import.mjs.
 *
 * Run: node get-session.mjs
 * Output: ka-session.json (in the same directory)
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dir, 'ka-session.json');

// Use installed Playwright Chromium — run `npx playwright install chromium` if missing
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

let capturedRequest = null;

page.on('request', req => {
  if (req.url().includes('ContentRouteLessonAndContentData') && !capturedRequest) {
    capturedRequest = {
      url: req.url(),
      headers: req.headers(),
    };
  }
});

console.log('Opening KA page to capture session...');
try {
  await page.goto(
    'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:algebra-overview-history/v/origins-of-algebra',
    { waitUntil: 'networkidle', timeout: 45000 }
  );
} catch (e) {
  // Timeout is fine — we just need the cookies and the captured request
}

const cookies = await page.context().cookies();
await browser.close();

if (!capturedRequest) {
  console.error('Failed to capture request — try running again');
  process.exit(1);
}

writeFileSync(SESSION_FILE, JSON.stringify({ cookies, sampleRequest: capturedRequest }, null, 2));
console.log(`✓ Session saved to ${SESSION_FILE}`);
console.log(`  Cookies: ${cookies.length}`);
