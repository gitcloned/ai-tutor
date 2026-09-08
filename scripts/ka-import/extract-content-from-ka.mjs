/**
 * extract-content-from-ka.mjs
 *
 * Fetches a single KA topic (lesson) and all its content — videos, articles,
 * exercises, and exercise questions — then writes a single reviewable JSON file.
 *
 * Usage:
 *   node extract-content-from-ka.mjs <url> [options]
 *
 * Options:
 *   --out <path>          Output file (default: ./<topic-slug>-import.json)
 *   --session <path>      Path to ka-session.json (default: ./ka-session.json)
 *   --no-questions        Skip exercise question fetch (content hierarchy only)
 *   --subject <name>      Subject label (default: "Mathematics")
 *   --strand-title <t>    Override strand title (default: derived from KA course slug)
 *   --concurrency <n>     Parallel content-detail fetches (default: 5)
 *   --delay-min <ms>      Min random delay between requests (default: 300)
 *   --delay-max <ms>      Max random delay between requests (default: 1200)
 *
 * Examples:
 *   node extract-content-from-ka.mjs https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:linear-equations-graphs/x2f8bb11595b61c86:two-variable-linear-equations-intro
 *   node extract-content-from-ka.mjs <url> --no-questions --out /tmp/review.json
 *   node extract-content-from-ka.mjs <url> --strand-title "Algebra 1" --subject "Mathematics"
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? true;
}

const sourceUrl     = args.find(a => a.startsWith('http')) ?? null;
const outFile       = flag('--out');
const sessionPath   = flag('--session') || join(__dir, 'ka-session.json');
const noQuestions   = args.includes('--no-questions');
const subject       = flag('--subject')       || 'Mathematics';
const strandTitle   = flag('--strand-title')  || null;   // derived if null
const concurrency   = parseInt(flag('--concurrency') || '5', 10);
const delayMin      = parseInt(flag('--delay-min')   || '300', 10);
const delayMax      = parseInt(flag('--delay-max')   || '1200', 10);

const BACKOFF_MIN   = 5_000;
const BACKOFF_MAX   = 30_000;
const MAX_RETRIES   = 4;

if (!sourceUrl) {
  console.error('Usage: node extract-content-from-ka.mjs <url> [options]');
  console.error('  e.g. https://www.khanacademy.org/math/algebra/.../two-variable-linear-equations-intro');
  process.exit(1);
}

if (!existsSync(sessionPath)) {
  console.error(`ka-session.json not found at ${sessionPath} — run get-session.mjs first`);
  process.exit(1);
}

// ── Parse URL ─────────────────────────────────────────────────────────────────
// KA URL shape: /math/<course>/<unit-slug>/<topic-slug>
// or:           /math/<course>/<unit-slug>/<topic-slug>/v/<video-slug>  ← strip content suffix

const parsed = new URL(sourceUrl);
const segments = parsed.pathname.replace(/^\//, '').split('/').filter(Boolean);

// Strip trailing content item (v/, e/, a/ prefix)
const contentPrefixes = new Set(['v', 'e', 'a']);
const trimmed = contentPrefixes.has(segments[segments.length - 2])
  ? segments.slice(0, -2)
  : segments;

if (trimmed.length < 3) {
  console.error('URL must point to a topic (lesson) — need at least course/unit/topic path segments');
  process.exit(1);
}

// Segments: [subject, course, ...unit-slug-parts, topic-slug]
// KA uses simple 2-segment paths: math/algebra/<unit>/<topic>
const topicSlug  = trimmed[trimmed.length - 1];
const unitSlug   = trimmed[trimmed.length - 2];
const courseSlug = trimmed.slice(0, trimmed.length - 2).join('/'); // e.g. "math/algebra"
const kaPath     = trimmed.join('/');

const defaultStrandTitle = courseSlug.split('/').pop()
  .replace(/-/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());  // "algebra" → "Algebra"

const resolvedStrandTitle = strandTitle ?? defaultStrandTitle;
const defaultOut = join(__dir, `${topicSlug}-import.json`);
const resolvedOut = outFile || defaultOut;

console.log(`Extracting topic: ${kaPath}`);
console.log(`Strand: ${resolvedStrandTitle} | Subject: ${subject}`);
console.log(`Output: ${resolvedOut}\n`);

// ── Session / HTTP ────────────────────────────────────────────────────────────

const session        = JSON.parse(readFileSync(sessionPath, 'utf8'));
const cookieHeader   = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
const capturedUrl    = new URL(session.sampleRequest.url);
const pcv            = capturedUrl.searchParams.get('pcv');
const hash           = capturedUrl.searchParams.get('hash');
const ua             = session.sampleRequest.headers['user-agent'];
const exerciseQuery  = session.exerciseQuery ?? null;

if (!noQuestions && !exerciseQuery) {
  console.warn('Warning: exerciseQuery not in session — run get-session.mjs to refresh. Skipping questions.\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms)      { return new Promise(r => setTimeout(r, ms)); }

function get(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        cookie: cookieHeader,
        'x-ka-fkey': '1',
        'user-agent': ua,
        referer: 'https://www.khanacademy.org/',
        ...extraHeaders,
      },
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

/** Fetch KA internal GraphQL content+lesson route. */
async function fetchRoute(path, attempt = 1) {
  const variables = encodeURIComponent(JSON.stringify({ path, countryCode: 'IN' }));
  const url = `https://www.khanacademy.org/api/internal/graphql/ContentRouteLessonAndContentData?fastly_cacheable=persist_until_publish&pcv=${pcv}&hash=${hash}&variables=${variables}&lang=en&app=khanacademy`;
  const { status, body } = await get(url);

  if (status === 429 && attempt <= MAX_RETRIES) {
    const wait = rand(BACKOFF_MIN, BACKOFF_MAX);
    console.warn(`  429 on route fetch — waiting ${(wait/1000).toFixed(1)}s`);
    await sleep(wait);
    return fetchRoute(path, attempt + 1);
  }
  try { return JSON.parse(body)?.data?.contentRoute?.listedPathData ?? null; }
  catch { return null; }
}

/**
 * Fetch all unique assessment items for a KA exercise.
 * Uses the internal GraphQL query (POST) with problemNumber iteration.
 * Stops when a sha repeats (full pool fetched) or safety cap is reached.
 */
async function fetchAllAssessmentItems(exerciseId, attempt = 1) {
  if (!exerciseQuery) return [];

  const seen    = new Map(); // sha → parsed item
  const MAX_POOL = 200;
  let n = 1;

  while (seen.size < MAX_POOL) {
    await sleep(rand(delayMin, delayMax));
    const body = JSON.stringify({
      operationName: 'getAssessmentItemByProblemNumber',
      variables: { exerciseId, problemNumber: n, hideVisual: false },
      query: exerciseQuery,
    });

    const result = await new Promise(resolve => {
      const req = https.request({
        hostname: 'www.khanacademy.org',
        path: '/api/internal/graphql/getAssessmentItemByProblemNumber?lang=en&app=khanacademy',
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-ka-fkey': '1', 'user-agent': ua, referer: 'https://www.khanacademy.org/' },
      }, res => {
        if (res.statusCode === 429) {
          res.resume();
          const wait = rand(BACKOFF_MIN, BACKOFF_MAX);
          sleep(wait).then(() => resolve(null));
          return;
        }
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.write(body);
      req.end();
    });

    const item = result?.data?.assessmentItemByProblemNumber?.item;
    if (!item) break;
    if (seen.has(item.sha)) break;  // full pool fetched
    seen.set(item.sha, item);
    n++;
  }

  return Array.from(seen.values());
}

/**
 * Extract YouTube ID from KA content detail.
 * KA now returns youtubeId directly on the content object.
 * Falls back to parsing downloadUrls for older response shapes.
 */
function extractYoutubeId(detail) {
  if (detail?.youtubeId) return detail.youtubeId;
  if (detail?.translatedYoutubeId) return detail.translatedYoutubeId;
  try {
    const mp4 = JSON.parse(detail?.downloadUrls || '{}')?.mp4 || '';
    return mp4.match(/converted\/(.+?)\.mp4/)?.[1] ?? null;
  } catch { return null; }
}

/** Parse raw Perseus item_data into { content, widgets, hints }. */
function parsePerseusContent(rawItemData) {
  try {
    const d = typeof rawItemData === 'string' ? JSON.parse(rawItemData) : rawItemData;
    const q = d.question ?? d;
    return { content: q.content ?? '', widgets: q.widgets ?? {}, hints: d.hints ?? [] };
  } catch { return null; }
}

/** Concurrent task runner with max concurrency. */
async function runConcurrent(tasks, limit, fn) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await fn(tasks[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Step 1: Fetch topic (lesson) page ─────────────────────────────────────────

console.log('Fetching topic page...');
const routeData = await fetchRoute(kaPath);

if (!routeData) {
  console.error('Failed to fetch topic route data. Check session validity.');
  process.exit(1);
}

// The lesson data lives at routeData.lesson; individual content at routeData.content
const lesson = routeData.lesson ?? routeData.unit ?? null;

if (!lesson) {
  console.error('Could not find lesson data in API response. URL may point to a unit, not a topic.');
  console.error('Response keys:', Object.keys(routeData).join(', '));
  process.exit(1);
}

// Extract unit title from breadcrumbs if available
const breadcrumbs = routeData.breadcrumbs ?? [];
const unitBreadcrumb   = breadcrumbs.find(b => b.slug === unitSlug);
const strandBreadcrumb = breadcrumbs.find(b => b.slug && courseSlug.endsWith(b.slug));

const unitTitle   = unitBreadcrumb?.translatedTitle ?? unitBreadcrumb?.title ?? unitSlug;
const strandKaSlug = courseSlug.split('/').pop();

// Items are in curatedChildren or children
const rawItems = lesson.curatedChildren ?? lesson.children ?? [];
console.log(`Found ${rawItems.length} items in topic: ${lesson.translatedTitle ?? lesson.title ?? topicSlug}`);

// ── Step 2: Enrich each content item ─────────────────────────────────────────

console.log(`Enriching ${rawItems.length} items (concurrency: ${concurrency})...\n`);

// Kind prefix map: KA contentKind → URL segment
const kindPrefix = { Video: 'v', Exercise: 'e', Article: 'a', Talkthrough: 'v' };

const enriched = await runConcurrent(rawItems, concurrency, async (item, idx) => {
  await sleep(rand(delayMin, delayMax));

  // Prefer relativeUrl from API; fall back to constructing it from kaPath + kind + slug
  let itemPath = (item.relativeUrl ?? '').replace(/^\//, '');
  if (!itemPath) {
    const kind = item.contentKind ?? item.__typename ?? '';
    const prefix = kindPrefix[kind] ?? 'v';
    itemPath = `${kaPath}/${prefix}/${item.slug}`;
  }

  const data   = await fetchRoute(itemPath);
  const detail = data?.content ?? null;
  process.stdout.write(`  [${idx + 1}/${rawItems.length}] ${item.translatedTitle ?? item.slug} ✓\n`);
  return { ...item, detail };
});

// ── Step 3: Separate teaching vs exercise items ───────────────────────────────

const teachingItems = [];
const exerciseItems = [];

for (const item of enriched) {
  const kind = item.contentKind ?? item.__typename ?? '';
  const isExercise = kind === 'Exercise' || kind === 'exercise';

  if (isExercise) {
    const detail = item.detail;
    exerciseItems.push({
      title:       detail?.translatedTitle ?? item.translatedTitle ?? item.slug,
      type:        'practice-test',
      source:      'khan-academy',
      kaSlug:      item.slug,
      // Numeric internal exerciseId needed for question fetching
      _exerciseId: detail?.id ?? detail?.contentId ?? null,
      url:         item.relativeUrl ? `https://www.khanacademy.org${item.relativeUrl}` : null,
      description: detail?.translatedDescription ?? null,
      questions:   [],  // populated in Step 4
    });
  } else {
    const detail = item.detail;
    const ytId   = extractYoutubeId(detail);
    const entry  = {
      title:       detail?.translatedTitle ?? item.translatedTitle ?? item.slug,
      type:        kind === 'Article' || kind === 'article' ? 'article' : 'teaching-video',
      source:      'khan-academy',
      kaSlug:      item.slug,
      url:         item.relativeUrl ? `https://www.khanacademy.org${item.relativeUrl}` : null,
      description: detail?.translatedDescription ?? null,
    };
    if (entry.type === 'teaching-video') {
      entry.youtubeId  = ytId;
      entry.youtubeUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : null;
      entry.duration   = detail?.duration ?? null;
      entry.thumbnail  = detail?.imageUrl ?? null;
      entry.cfuMarkers = (detail?.keyMoments ?? []).map(m => ({
        timestamp: m.startOffset,
        label:     m.label,
        question:  null,
      }));
    }
    teachingItems.push(entry);
  }
}

console.log(`\nTeaching items: ${teachingItems.length} | Exercises: ${exerciseItems.length}`);

// ── Step 4: Fetch questions for each exercise ─────────────────────────────────

const skipQFetch = noQuestions || !exerciseQuery;
if (!skipQFetch && exerciseItems.length > 0) {
  console.log(`\nFetching questions for ${exerciseItems.length} exercises (sha-dedup, max 200/exercise)...`);

  for (const exercise of exerciseItems) {
    const exerciseId = exercise._exerciseId;
    if (!exerciseId) {
      console.log(`  ${exercise.title} — no exerciseId, skipping`);
      continue;
    }
    process.stdout.write(`  ${exercise.title} ... `);

    const items = await fetchAllAssessmentItems(exerciseId);
    exercise.questions = items
      .map(item => {
        const perseusContent = parsePerseusContent(item.itemDataAnswerless ?? item);
        if (!item.sha || !perseusContent) return null;
        return {
          kaSlug:          item.sha,
          type:            'perseus',
          source:          'khan-academy',
          perseusContent,
          difficultyLevel: null,  // not available from KA; enrich manually
          teachingTree:    null,  // manually authored
        };
      })
      .filter(Boolean);

    console.log(`${exercise.questions.length} questions`);
  }
} else {
  if (noQuestions) console.log('\n--no-questions set — skipping question fetch');
  else if (!exerciseQuery) console.log('\nNo exerciseQuery in session — skipping question fetch');
}

// Remove internal _exerciseId from output (not needed in the import JSON)
for (const ex of exerciseItems) delete ex._exerciseId;

// ── Step 5: Build output JSON ─────────────────────────────────────────────────

const output = {
  _comment:    'Generated by extract-content-from-ka.mjs. Review before running import.mjs.',
  extractedAt: new Date().toISOString(),
  sourceUrl,
  strand: {
    title:   resolvedStrandTitle,
    subject,
    kaSlug:  strandKaSlug,
    source:  'khan-academy',
  },
  unit: {
    title:       unitTitle,
    kaSlug:      unitSlug,
    description: null,
    source:      'khan-academy',
  },
  topic: {
    title:        lesson.translatedTitle ?? lesson.title ?? topicSlug,
    kaSlug:       topicSlug,
    source:       'khan-academy',
    teachingItems,
    exerciseItems,
  },
};

writeFileSync(resolvedOut, JSON.stringify(output, null, 2), 'utf8');

const totalQuestions = exerciseItems.reduce((n, e) => n + e.questions.length, 0);
console.log(`\n✅ Written to ${resolvedOut}`);
console.log(`   teaching items: ${teachingItems.length}`);
console.log(`   exercises:      ${exerciseItems.length}`);
console.log(`   questions:      ${totalQuestions}${noQuestions ? ' (skipped)' : ''}`);
console.log(`\nReview the JSON, then run:`);
console.log(`  node import.mjs ${resolvedOut}`);
