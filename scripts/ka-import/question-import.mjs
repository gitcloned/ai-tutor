/**
 * question-import.mjs
 *
 * Enrichment step: for every practice-test Resource in MongoDB that has no
 * questions yet, fetches its full Perseus question pool from KA and writes
 * Question docs to the questions collection. Links Resource.questions[].
 *
 * Uses the internal GraphQL query getAssessmentItemByProblemNumber with
 * sha-deduplication to discover the full exercise pool (stops when a sha repeats).
 *
 * Idempotent: { source, kaSlug } is the unique key per question.
 *
 * Run: node question-import.mjs [options]
 *
 * Options:
 *   --session <path>   Path to ka-session.json (default: ./ka-session.json)
 *   --mongo <url>      MongoDB URL (default: mongodb://localhost:27017 or MONGO_URL env)
 *   --db <name>        Database name (default: prodigy or DB_NAME env)
 *   --all              Re-fetch even exercises that already have questions
 *   --delay-min <ms>   Min random delay between requests (default: 300)
 *   --delay-max <ms>   Max random delay between requests (default: 1200)
 *
 * Prerequisites:
 *   - ka-session.json with exerciseQuery field (run get-session.mjs first)
 *   - MongoDB loaded by import.mjs (practice-test resources exist)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { MongoClient } from 'mongodb';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(name); return i === -1 ? null : (args[i+1] ?? true); }

const sessionPath = flag('--session') || join(__dir, 'ka-session.json');
const mongoUrl    = flag('--mongo')   || process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName      = flag('--db')      || process.env.DB_NAME   || 'prodigy';
const refetchAll  = args.includes('--all');
const delayMin    = parseInt(flag('--delay-min') || '300', 10);
const delayMax    = parseInt(flag('--delay-max') || '1200', 10);
const BACKOFF_MIN = 5_000;
const BACKOFF_MAX = 30_000;

if (!existsSync(sessionPath)) {
  console.error(`ka-session.json not found at ${sessionPath} — run get-session.mjs first`);
  process.exit(1);
}

const session       = JSON.parse(readFileSync(sessionPath, 'utf8'));
const cookieHeader  = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
const capturedUrl   = new URL(session.sampleRequest.url);
const pcv           = capturedUrl.searchParams.get('pcv');
const hash          = capturedUrl.searchParams.get('hash');
const ua            = session.sampleRequest.headers['user-agent'];
const exerciseQuery = session.exerciseQuery ?? null;

if (!exerciseQuery) {
  console.error('exerciseQuery not in session — run get-session.mjs to refresh (it now also visits an exercise page)');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms)      { return new Promise(r => setTimeout(r, ms)); }

/** Fetch exercise content from KA to get its numeric internal ID. */
function fetchExerciseMeta(exercisePath) {
  return new Promise(resolve => {
    const variables = encodeURIComponent(JSON.stringify({ path: exercisePath, countryCode: 'IN' }));
    const url = `https://www.khanacademy.org/api/internal/graphql/ContentRouteLessonAndContentData?fastly_cacheable=persist_until_publish&pcv=${pcv}&hash=${hash}&variables=${variables}&lang=en&app=khanacademy`;
    https.get(url, { headers: { cookie: cookieHeader, 'x-ka-fkey': '1', 'user-agent': ua, referer: 'https://www.khanacademy.org/' } }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)?.data?.contentRoute?.listedPathData?.content ?? null); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/** Post one getAssessmentItemByProblemNumber request. */
function postAssessmentItem(exerciseId, problemNumber, attempt = 1) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      operationName: 'getAssessmentItemByProblemNumber',
      variables:     { exerciseId, problemNumber, hideVisual: false },
      query:         exerciseQuery,
    });
    const req = https.request({
      hostname: 'www.khanacademy.org',
      path:     '/api/internal/graphql/getAssessmentItemByProblemNumber?lang=en&app=khanacademy',
      method:   'POST',
      headers:  { 'content-type': 'application/json', cookie: cookieHeader, 'x-ka-fkey': '1', 'user-agent': ua, referer: 'https://www.khanacademy.org/' },
    }, res => {
      if (res.statusCode === 429 && attempt <= 4) {
        res.resume();
        const wait = rand(BACKOFF_MIN, BACKOFF_MAX);
        console.warn(`  429 — waiting ${(wait/1000).toFixed(1)}s`);
        sleep(wait).then(() => postAssessmentItem(exerciseId, problemNumber, attempt + 1).then(resolve));
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.write(body);
    req.end();
  });
}

/** Fetch all unique assessment items for an exercise by sha-deduplication. */
async function fetchAllItems(exerciseId) {
  const seen = new Map();
  let n = 1;
  while (seen.size < 200) {
    await sleep(rand(delayMin, delayMax));
    const result = await postAssessmentItem(exerciseId, n);
    const item   = result?.data?.assessmentItemByProblemNumber?.item;
    if (!item) break;
    if (seen.has(item.sha)) break;
    seen.set(item.sha, item);
    n++;
  }
  return Array.from(seen.values());
}

function parsePerseusContent(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const q = d.question ?? d;
    return { content: q.content ?? '', widgets: q.widgets ?? {}, hints: d.hints ?? [] };
  } catch { return null; }
}

// ── MongoDB ───────────────────────────────────────────────────────────────────

const client = new MongoClient(mongoUrl);
await client.connect();
const db = client.db(dbName);

const resourcesColl = db.collection('resources');
const questionsColl = db.collection('questions');

try { await questionsColl.dropIndex('source_1_kaSlug_1'); } catch {}
await questionsColl.createIndex({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });

// Load practice-test resources
const filter = refetchAll
  ? { type: 'practice-test', source: 'khan-academy' }
  : { type: 'practice-test', source: 'khan-academy', $or: [{ questions: { $exists: false } }, { questions: { $size: 0 } }] };

const exercises = await resourcesColl.find(filter).toArray();
console.log(`Found ${exercises.length} practice-test resources to process${refetchAll ? ' (--all)' : ' (no questions yet)'}\n`);

let totalQuestions = 0, processed = 0, skipped = 0;

for (const exercise of exercises) {
  // Derive KA path from URL to fetch exerciseId
  const url = exercise.url ?? '';
  const kaPath = url.replace('https://www.khanacademy.org/', '');

  if (!kaPath) { skipped++; continue; }

  process.stdout.write(`  ${exercise.title} ... `);

  await sleep(rand(delayMin, delayMax));

  // Get numeric exerciseId from content route
  const meta = await fetchExerciseMeta(kaPath);
  const exerciseId = meta?.id ?? meta?.contentId ?? null;

  if (!exerciseId) {
    console.log('no exerciseId (skipped)');
    skipped++;
    continue;
  }

  // Fetch all unique questions
  const items = await fetchAllItems(exerciseId);

  if (items.length === 0) {
    console.log('0 questions');
    skipped++;
    continue;
  }

  const questionIds = [];
  for (const item of items) {
    const perseusContent = parsePerseusContent(item.itemDataAnswerless);
    if (!item.sha || !perseusContent) continue;

    const result = await questionsColl.findOneAndUpdate(
      { source: 'khan-academy', kaSlug: item.sha },
      { $set: {
          type:             'perseus',
          source:           'khan-academy',
          kaSlug:           item.sha,
          perseusContent,
          difficultyLevel:  null,
          appearedInExams:  [],
          relatedQuestions: [],
          teachingTree:     null,
      }},
      { upsert: true, returnDocument: 'after' }
    );
    questionIds.push(result._id);
    totalQuestions++;
  }

  await resourcesColl.updateOne({ _id: exercise._id }, { $set: { questions: questionIds } });
  console.log(`${questionIds.length} questions`);
  processed++;
}

await client.close();

console.log(`\n✅ Question import complete — db: ${dbName}`);
console.log(`   exercises processed: ${processed}`);
console.log(`   exercises skipped:   ${skipped}`);
console.log(`   questions written:   ${totalQuestions}`);
