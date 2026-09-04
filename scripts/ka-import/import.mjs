/**
 * import.mjs
 *
 * Step 2 of the KA import pipeline.
 * Reads ka-session.json (from get-session.mjs) and ka-algebra.json (topic tree),
 * enriches all items via concurrent HTTP requests to KA's internal GraphQL API,
 * then writes Concepts and Resources to MongoDB.
 *
 * Run: node import.mjs [--subject math/algebra] [--mongo mongodb://localhost:27017] [--db prodigy]
 *
 * Prerequisites:
 *   - ka-session.json exists (run get-session.mjs first)
 *   - ka-algebra.json exists (topic tree scraped by get-topic-tree.mjs)
 *   - MongoDB running locally
 *   - npm install mongodb playwright
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { MongoClient } from 'mongodb';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const SESSION_FILE = join(__dir, 'ka-session.json');
const TREE_FILE = join(__dir, 'ka-algebra.json');
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'prodigy';
const CONCURRENCY = 10;

if (!existsSync(SESSION_FILE)) {
  console.error('ka-session.json not found — run get-session.mjs first');
  process.exit(1);
}
if (!existsSync(TREE_FILE)) {
  console.error('ka-algebra.json not found — run get-topic-tree.mjs first');
  process.exit(1);
}

// ── Session + HTTP fetcher ────────────────────────────────────────────────────
const session = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
const cookieHeader = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
const capturedUrl = new URL(session.sampleRequest.url);
const pcv = capturedUrl.searchParams.get('pcv');
const hash = capturedUrl.searchParams.get('hash');
const ua = session.sampleRequest.headers['user-agent'];

/**
 * Fetches full content detail for a single KA item via the internal GraphQL API.
 * Uses session cookies captured by get-session.mjs — no browser needed.
 *
 * @param {string} kaPath  e.g. "math/algebra/.../v/origins-of-algebra"
 * @returns {object|null}  content node from GraphQL response
 */
function fetchContent(kaPath) {
  return new Promise((resolve) => {
    const variables = encodeURIComponent(JSON.stringify({ path: kaPath, countryCode: 'IN' }));
    const url = `https://www.khanacademy.org/api/internal/graphql/ContentRouteLessonAndContentData?fastly_cacheable=persist_until_publish&pcv=${pcv}&hash=${hash}&variables=${variables}&lang=en&app=khanacademy`;
    https.get(url, {
      headers: {
        cookie: cookieHeader,
        'x-ka-fkey': '1',
        'user-agent': ua,
        referer: 'https://www.khanacademy.org/',
      },
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)?.data?.contentRoute?.listedPathData?.content ?? null); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/** Runs tasks concurrently with a max concurrency limit. */
async function runConcurrent(tasks, concurrency, fn) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await fn(tasks[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/** Extracts YouTube ID from KA's downloadUrls JSON string. */
function youtubeId(downloadUrls) {
  try {
    const mp4 = JSON.parse(downloadUrls || '{}')?.mp4 || '';
    return mp4.match(/converted\/(.+?)\.mp4/)?.[1] ?? null;
  } catch { return null; }
}

/** Converts a KA item's full URL to a relative path suitable for the API. */
function toKaPath(url) {
  return url?.replace('https://www.khanacademy.org/', '') ?? null;
}

// ── Load topic tree ───────────────────────────────────────────────────────────
const tree = JSON.parse(readFileSync(TREE_FILE, 'utf8'));

const allItems = [];
for (const unit of tree.units) {
  for (const lesson of unit.lessons) {
    for (const item of lesson.items) {
      allItems.push({ ...item, unitTitle: unit.title, unitSlug: unit.slug, lessonTitle: lesson.title, lessonSlug: lesson.slug });
    }
  }
}

// ── Enrich items via HTTP ─────────────────────────────────────────────────────
console.log(`Enriching ${allItems.length} items (${CONCURRENCY} concurrent)...`);
const start = Date.now();

const enriched = await runConcurrent(allItems, CONCURRENCY, async item => {
  const path = toKaPath(item.url);
  if (!path) return { ...item, detail: null };
  const detail = await fetchContent(path);
  return { ...item, detail };
});

console.log(`✓ Enriched in ${((Date.now() - start) / 1000).toFixed(1)}s`);

// ── MongoDB ───────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db(DB_NAME);

const resourcesColl = db.collection('resources');
const conceptsColl = db.collection('concepts');

// Clear previous KA import to allow re-runs
await resourcesColl.deleteMany({ source: 'khan-academy' });
await conceptsColl.deleteMany({ source: 'khan-academy' });

// ── Insert Resources ──────────────────────────────────────────────────────────
const resourceDocs = enriched.map(item => {
  const d = item.detail;
  const ytId = youtubeId(d?.downloadUrls);
  return {
    source: 'khan-academy',
    title: d?.translatedTitle || item.title,
    type: item.type === 'Video' ? 'teaching-video'
        : item.type === 'Exercise' ? 'practice-test'
        : 'article',
    description: d?.translatedDescription || item.description || null,
    url: item.url,
    youtubeId: ytId,
    youtubeUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : null,
    duration: d?.duration ?? null,
    thumbnail: d?.imageUrl ?? null,
    // Key moments from KA map directly to CFU marker timestamps
    cfuMarkers: (d?.keyMoments || []).map(m => ({
      timestamp: m.startOffset,
      label: m.label,
      question: null,   // to be linked manually or via question import
    })),
    kaSlug: item.slug,
    unitSlug: item.unitSlug,
    lessonSlug: item.lessonSlug,
  };
});

const resourceInsert = await resourcesColl.insertMany(resourceDocs);
console.log(`✓ Inserted ${resourceInsert.insertedCount} resources`);

// Build slug → ObjectId map for linking
const resourceIdMap = {};
resourceDocs.forEach((doc, i) => {
  resourceIdMap[doc.kaSlug] = resourceInsert.insertedIds[i];
});

// ── Insert Concepts (one per KA unit) ─────────────────────────────────────────
// Prerequisites = previous unit in sequence (unit-order progression)
const conceptDocs = tree.units.map((unit, idx) => ({
  source: 'khan-academy',
  title: unit.title,
  kaSlug: unit.slug,
  description: unit.description || null,
  lessonPlan: unit.lessons.map(lesson => ({
    title: lesson.title,
    kaSlug: lesson.slug,
    type: 'ido',          // all imported as ido — to be refined manually
    instruction: null,
    resources: lesson.items.map(item => resourceIdMap[item.slug]).filter(Boolean),
    learningIndicator: null,
  })),
  prerequisites: idx > 0 ? [{ kaSlug: tree.units[idx - 1].slug }] : [],
  nextConcepts: idx < tree.units.length - 1 ? [{ kaSlug: tree.units[idx + 1].slug }] : [],
  boards: [],
  classApplicableTo: [],
  questions: [],
  misconceptions: [],
}));

const conceptInsert = await conceptsColl.insertMany(conceptDocs);
console.log(`✓ Inserted ${conceptInsert.insertedCount} concepts`);

// Resolve kaSlug references → ObjectIds
const slugToId = {};
conceptDocs.forEach((doc, i) => { slugToId[doc.kaSlug] = conceptInsert.insertedIds[i]; });

for (const doc of conceptDocs) {
  await conceptsColl.updateOne(
    { kaSlug: doc.kaSlug },
    {
      $set: {
        prerequisites: doc.prerequisites.map(p => slugToId[p.kaSlug]).filter(Boolean),
        nextConcepts: doc.nextConcepts.map(p => slugToId[p.kaSlug]).filter(Boolean),
      },
    }
  );
}
console.log('✓ Resolved prerequisite links');

await client.close();

console.log(`\n✅ Import complete — database: ${DB_NAME}`);
console.log(`   concepts:  ${conceptInsert.insertedCount}`);
console.log(`   resources: ${resourceInsert.insertedCount}`);
