/**
 * get-session.mjs
 *
 * Step 1 of the KA import pipeline.
 * Opens a real browser (Playwright) once to pass KA's bot detection,
 * captures session cookies + request signatures needed by all import scripts,
 * and saves them to ka-session.json.
 *
 * Captures:
 *   - Session cookies
 *   - ContentRouteLessonAndContentData GraphQL signature (pcv + hash)
 *   - getAssessmentItemByProblemNumber exact query text (required for exercise questions)
 *
 * Run:   node get-session.mjs
 * Output: ka-session.json (in the same directory)
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dir, 'ka-session.json');

const browser = await chromium.launch({ headless: false });
const context  = await browser.newContext();
const page     = await context.newPage();

let contentRouteRequest  = null;
let exerciseQueryBody    = null;

// Capture content route signature (pcv + hash)
page.on('request', req => {
  if (req.url().includes('ContentRouteLessonAndContentData') && !contentRouteRequest) {
    contentRouteRequest = { url: req.url(), headers: req.headers() };
  }
});

// ── Step 1: Visit a video page to capture content route signature ─────────────

console.log('Step 1: Opening video page to capture content route signature...');
try {
  await page.goto(
    'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:algebra-overview-history/v/origins-of-algebra',
    { waitUntil: 'networkidle', timeout: 45000 }
  );
} catch {
  // Timeout is fine — we just need the captured request
}

if (!contentRouteRequest) {
  console.error('Failed to capture content route request — try running again');
  await browser.close();
  process.exit(1);
}
console.log('  ✓ Content route signature captured');

// ── Step 2: Visit an exercise page to capture the exercise query text ──────────

console.log('Step 2: Opening exercise page to capture assessment item query...');
await page.route('**/getAssessmentItemByProblemNumber**', async route => {
  if (!exerciseQueryBody) {
    exerciseQueryBody = route.request().postDataJSON();
  }
  await route.continue();
});

try {
  await page.goto(
    'https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:linear-equations-graphs/x2f8bb11595b61c86:two-variable-linear-equations-intro/e/plugging_in_values',
    { waitUntil: 'networkidle', timeout: 45000 }
  );
  await page.waitForTimeout(3000);
} catch {
  // Timeout fine
}

if (!exerciseQueryBody) {
  console.warn('  ⚠ Could not capture exercise query — question import will be unavailable');
} else {
  console.log('  ✓ Exercise query captured');
}

const cookies = await context.cookies();
await browser.close();

// ── Save ──────────────────────────────────────────────────────────────────────

writeFileSync(SESSION_FILE, JSON.stringify({
  cookies,
  sampleRequest: contentRouteRequest,
  // Exact query text required by getAssessmentItemByProblemNumber (KA persisted query safelist)
  exerciseQuery: exerciseQueryBody?.query ?? null,
}, null, 2));

console.log(`\n✓ Session saved to ${SESSION_FILE}`);
console.log(`  Cookies:        ${cookies.length}`);
console.log(`  Content route:  ${contentRouteRequest ? 'yes' : 'no'}`);
console.log(`  Exercise query: ${exerciseQueryBody ? 'yes' : 'no'}`);
