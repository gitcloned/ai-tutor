/**
 * import.mjs
 *
 * Step 2 of the KA import pipeline.
 * Reads ka-session.json (from get-session.mjs) and ka-algebra.json (topic tree),
 * enriches all items via concurrent HTTP requests to KA's internal GraphQL API,
 * then writes the full 4-level hierarchy to MongoDB:
 *
 *   Strand → Unit → Topic → Concept
 *
 * Each Concept is one KA content item (video or article), with its teaching
 * video/article as a Resource in its lessonPlan.
 * KA exercises become practice-test Resources linked to the parent Topic.
 *
 * Run: node import.mjs [--subject math/algebra] [--mongo mongodb://localhost:27017] [--db prodigy]
 *
 * Prerequisites:
 *   - ka-session.json exists (run get-session.mjs first)
 *   - ka-algebra.json exists (topic tree scraped by get-topic-tree.mjs)
 *   - MongoDB running locally
 *   - npm install mongodb playwright
 *
 * What is NOT imported (requires manual authoring or a separate script):
 *   - probingTree          — authored manually per concept
 *   - misconceptions       — authored manually
 *   - masteryQuestions     — populated by question-import.mjs (exercise question stems)
 *   - boards, classApplicableTo — mapped manually
 *   - lessonPlan step types (ido/wedo/youdo) — all imported as "ido"
 *   - Question answers     — KA withholds; must be filled manually or via LLM
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { MongoClient } from 'mongodb';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const SESSION_FILE = join(__dir, 'ka-session.json');
const TREE_FILE    = join(__dir, 'ka-algebra.json');
const MONGO_URL    = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME      = process.env.DB_NAME   || 'prodigy';
const CONCURRENCY  = 10;

if (!existsSync(SESSION_FILE)) {
  console.error('ka-session.json not found — run get-session.mjs first');
  process.exit(1);
}
if (!existsSync(TREE_FILE)) {
  console.error('ka-algebra.json not found — run get-topic-tree.mjs first');
  process.exit(1);
}

// ── Session + HTTP fetcher ────────────────────────────────────────────────────
const session       = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
const cookieHeader  = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
const capturedUrl   = new URL(session.sampleRequest.url);
const pcv           = capturedUrl.searchParams.get('pcv');
const hash          = capturedUrl.searchParams.get('hash');
const ua            = session.sampleRequest.headers['user-agent'];

/**
 * Fetches full content detail for a single KA item via the internal GraphQL API.
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

// Flatten all items for concurrent enrichment
const allItems = [];
for (const unit of tree.units) {
  for (const lesson of unit.lessons) {
    for (const item of lesson.items) {
      allItems.push({ ...item, unitSlug: unit.slug, lessonSlug: lesson.slug });
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

// Build slug → detail map for fast lookup
const detailMap = {};
for (const item of enriched) {
  detailMap[item.slug] = item.detail;
}

// ── MongoDB ───────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db(DB_NAME);

const strandsColl   = db.collection('strands');
const unitsColl     = db.collection('units');
const topicsColl    = db.collection('topics');
const conceptsColl  = db.collection('concepts');
const resourcesColl = db.collection('resources');

// Clear previous KA import to allow re-runs
await strandsColl.deleteMany({ source: 'khan-academy' });
await unitsColl.deleteMany({ source: 'khan-academy' });
await topicsColl.deleteMany({ source: 'khan-academy' });
await conceptsColl.deleteMany({ source: 'khan-academy' });
await resourcesColl.deleteMany({ source: 'khan-academy' });
console.log('✓ Cleared previous KA import');

// ── 1. Strand ─────────────────────────────────────────────────────────────────
const strandResult = await strandsColl.insertOne({
  title: 'Algebra 1',
  subject: 'Mathematics',
  source: 'khan-academy',
  kaSlug: 'algebra',
  weight: null,
});
const strandId = strandResult.insertedId;
console.log(`✓ Inserted strand: Algebra 1`);

// ── 2. Units ──────────────────────────────────────────────────────────────────
const unitDocs = tree.units.map((unit, idx) => ({
  title: unit.title,
  description: unit.description || null,
  kaSlug: unit.slug,
  source: 'khan-academy',
  strand: strandId,
  order: idx + 1,
  prerequisites: [],  // resolved after insert
}));
const unitResult = await unitsColl.insertMany(unitDocs);

// Resolve unit prerequisites (sequential chain: unit[i] prereq = unit[i-1])
for (let i = 1; i < tree.units.length; i++) {
  await unitsColl.updateOne(
    { _id: unitResult.insertedIds[i] },
    { $set: { prerequisites: [unitResult.insertedIds[i - 1]] } }
  );
}

// Slug → ObjectId map for units
const unitSlugToId = {};
tree.units.forEach((unit, idx) => { unitSlugToId[unit.slug] = unitResult.insertedIds[idx]; });
console.log(`✓ Inserted ${unitResult.insertedCount} units`);

// ── 3. Topics + Concepts + Resources ─────────────────────────────────────────
let totalTopics   = 0;
let totalConcepts = 0;
let totalResources = 0;

for (const unit of tree.units) {
  const unitId = unitSlugToId[unit.slug];

  for (let lessonIdx = 0; lessonIdx < unit.lessons.length; lessonIdx++) {
    const lesson = unit.lessons[lessonIdx];

    // Separate teaching items (video/article) from exercises
    const teachingItems  = lesson.items.filter(item => item.type !== 'Exercise');
    const exerciseItems  = lesson.items.filter(item => item.type === 'Exercise');

    // Insert Topic
    const topicDoc = {
      title: lesson.title,
      description: null,
      kaSlug: lesson.slug,
      source: 'khan-academy',
      unit: unitId,
      order: lessonIdx + 1,
      probingTree: null,
      practiceTests: [],  // populated below after exercise resources are inserted
    };
    const topicResult = await topicsColl.insertOne(topicDoc);
    const topicId = topicResult.insertedId;
    totalTopics++;

    // Insert Resource + Concept for each teaching item (video or article)
    const conceptIds = [];
    for (let itemIdx = 0; itemIdx < teachingItems.length; itemIdx++) {
      const item   = teachingItems[itemIdx];
      const detail = detailMap[item.slug];
      const ytId   = youtubeId(detail?.downloadUrls);

      // Resource
      const resourceDoc = {
        source: 'khan-academy',
        title: detail?.translatedTitle || item.title,
        type: item.type === 'Video' ? 'teaching-video' : 'article',
        description: detail?.translatedDescription || null,
        url: item.url,
        kaSlug: item.slug,
        youtubeId: ytId,
        youtubeUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : null,
        duration: detail?.duration ?? null,
        thumbnail: detail?.imageUrl ?? null,
        cfuMarkers: (detail?.keyMoments || []).map(m => ({
          timestamp: m.startOffset,
          label: m.label,
          question: null,
        })),
      };
      const resourceResult = await resourcesColl.insertOne(resourceDoc);
      totalResources++;

      // Concept
      const conceptDoc = {
        title: detail?.translatedTitle || item.title,
        kaSlug: item.slug,
        source: 'khan-academy',
        topic: topicId,
        order: itemIdx + 1,
        prerequisites: itemIdx > 0 ? [conceptIds[itemIdx - 1]] : [],
        nextConcepts: [],
        boards: [],
        classApplicableTo: [],
        conceptWeightage: null,
        misconceptions: [],
        probingTree: null,
        masteryQuestions: [],
        examQuestions: [],
        lessonPlan: [
          {
            type: 'ido',
            instruction: null,
            resources: [resourceResult.insertedId],
            learningIndicator: null,
          },
        ],
      };
      const conceptResult = await conceptsColl.insertOne(conceptDoc);
      conceptIds.push(conceptResult.insertedId);
      totalConcepts++;
    }

    // Update nextConcepts for sequential chain within topic
    for (let i = 0; i < conceptIds.length - 1; i++) {
      await conceptsColl.updateOne(
        { _id: conceptIds[i] },
        { $set: { nextConcepts: [conceptIds[i + 1]] } }
      );
    }

    // Insert exercise Resources, link to topic.practiceTests
    const practiceTestIds = [];
    for (const item of exerciseItems) {
      const detail = detailMap[item.slug];
      const exerciseDoc = {
        source: 'khan-academy',
        title: detail?.translatedTitle || item.title,
        type: 'practice-test',
        description: detail?.translatedDescription || null,
        url: item.url,
        kaSlug: item.slug,
        questions: [],  // populated by question-import.mjs
      };
      const exResult = await resourcesColl.insertOne(exerciseDoc);
      practiceTestIds.push(exResult.insertedId);
      totalResources++;
    }

    if (practiceTestIds.length > 0) {
      await topicsColl.updateOne(
        { _id: topicId },
        { $set: { practiceTests: practiceTestIds } }
      );
    }
  }
}

await client.close();

console.log(`\n✅ Import complete — database: ${DB_NAME}`);
console.log(`   strand:    1`);
console.log(`   units:     ${unitResult.insertedCount}`);
console.log(`   topics:    ${totalTopics}`);
console.log(`   concepts:  ${totalConcepts}`);
console.log(`   resources: ${totalResources}`);
console.log(`\nNext step: run question-import.mjs to fetch exercise question stems from KA.`);
