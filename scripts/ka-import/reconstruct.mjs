/**
 * reconstruct.mjs
 *
 * Step 1 of the 2-step KA import pipeline.
 * Reads the existing MongoDB data (imported under the OLD schema, where each
 * KA Unit was stored as a "concept" with embedded lessons in lessonPlan) and
 * reconstructs the full 4-level hierarchy as ka-algebra-import.json:
 *
 *   Strand → Unit → Topic → Concept
 *
 * The output JSON is the source of truth for import.mjs (Step 2).
 * Review it before running the import.
 *
 * Run: node reconstruct.mjs [--mongo mongodb://localhost:27017] [--db prodigy]
 *
 * Prerequisites:
 *   - MongoDB running with old-schema KA data (17 unit-level "concept" docs)
 *   - npm install mongodb (or run from /tmp/ka-import which has it)
 */

import { MongoClient } from 'mongodb';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

const MONGO_URL  = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME    = process.env.DB_NAME   || 'prodigy';
const OUT_FILE   = join(__dir, 'ka-algebra-import.json');

const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db(DB_NAME);

// ── Load old data ─────────────────────────────────────────────────────────────

// Old schema: "concepts" collection stores KA units. Each has:
//   title, kaSlug, description, lessonPlan[{ title, kaSlug, resources[] }]
const oldUnits = await db.collection('concepts')
  .find({ source: 'khan-academy' })
  .sort({ _id: 1 })
  .toArray();

// All resources keyed by ObjectId string
const allResources = await db.collection('resources')
  .find({ source: 'khan-academy' })
  .toArray();

const resourceById = {};
for (const r of allResources) {
  resourceById[r._id.toString()] = r;
}

await client.close();
console.log(`Loaded ${oldUnits.length} units, ${allResources.length} resources from MongoDB`);

// ── Determine unit order from prerequisite chain ───────────────────────────────
// Build adjacency: prereq → next
const unitById = {};
for (const u of oldUnits) unitById[u._id.toString()] = u;

// Find root unit (no prerequisites)
let rootUnit = oldUnits.find(u => !u.prerequisites || u.prerequisites.length === 0);
if (!rootUnit) {
  console.warn('No root unit found — using insertion order');
  rootUnit = oldUnits[0];
}

// Walk chain
const orderedUnits = [];
const visited = new Set();
let current = rootUnit;
while (current && !visited.has(current._id.toString())) {
  orderedUnits.push(current);
  visited.add(current._id.toString());
  const nextId = current.nextConcepts?.[0]?.toString();
  current = nextId ? unitById[nextId] : null;
}

// Append any units not reached by chain (shouldn't happen, but safety net)
for (const u of oldUnits) {
  if (!visited.has(u._id.toString())) orderedUnits.push(u);
}

// ── Build import JSON ─────────────────────────────────────────────────────────

const units = [];

for (let unitIdx = 0; unitIdx < orderedUnits.length; unitIdx++) {
  const oldUnit = orderedUnits[unitIdx];

  const topics = [];

  // Each lessonPlan entry in the old schema = one Topic in the new schema.
  // Filter out quiz/test entries (no resources and title ends with "Quiz"/"Unit test")
  const lessonEntries = (oldUnit.lessonPlan || []).filter(lesson => {
    // Keep lessons that have at least one resource OR aren't clearly a quiz/test stub
    if (lesson.resources && lesson.resources.length > 0) return true;
    const lc = lesson.title.toLowerCase();
    if (lc.includes('quiz') || lc.includes('unit test')) return false;
    return true; // keep other empty lessons
  });

  for (let topicIdx = 0; topicIdx < lessonEntries.length; topicIdx++) {
    const lesson = lessonEntries[topicIdx];

    const teachingItems = [];
    const exerciseItems = [];

    for (const resourceId of (lesson.resources || [])) {
      const resource = resourceById[resourceId.toString()];
      if (!resource) continue;

      if (resource.type === 'practice-test') {
        exerciseItems.push({
          title:       resource.title,
          type:        resource.type,
          kaSlug:      resource.kaSlug,
          url:         resource.url ?? null,
          description: resource.description ?? null,
        });
      } else {
        // teaching-video or article
        const item = {
          title:       resource.title,
          type:        resource.type,
          kaSlug:      resource.kaSlug,
          url:         resource.url ?? null,
          description: resource.description ?? null,
        };
        if (resource.type === 'teaching-video') {
          item.youtubeId  = resource.youtubeId  ?? null;
          item.youtubeUrl = resource.youtubeUrl ?? null;
          item.duration   = resource.duration   ?? null;
          item.thumbnail  = resource.thumbnail  ?? null;
          item.cfuMarkers = (resource.cfuMarkers || []).map(m => ({
            timestamp: m.timestamp,
            label:     m.label,
            question:  null,
          }));
        }
        teachingItems.push(item);
      }
    }

    topics.push({
      title:         lesson.title,
      kaSlug:        lesson.kaSlug,
      order:         topicIdx + 1,
      teachingItems,
      exerciseItems,
    });
  }

  units.push({
    title:       oldUnit.title,
    kaSlug:      oldUnit.kaSlug,
    description: oldUnit.description ?? null,
    order:       unitIdx + 1,
    topics,
  });
}

const importDoc = {
  _comment: 'Generated by reconstruct.mjs from existing MongoDB data. Review before running import.mjs.',
  generatedAt: new Date().toISOString(),
  strand: {
    title:   'Algebra 1',
    subject: 'Mathematics',
    kaSlug:  'algebra',
    source:  'khan-academy',
  },
  units,
};

// ── Write output ──────────────────────────────────────────────────────────────

writeFileSync(OUT_FILE, JSON.stringify(importDoc, null, 2), 'utf8');

const topicCount   = units.reduce((n, u) => n + u.topics.length, 0);
const conceptCount = units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.teachingItems.length, 0), 0);
const exerciseCount = units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.exerciseItems.length, 0), 0);

console.log(`\n✅ Written to ${OUT_FILE}`);
console.log(`   strand:    1 (Algebra 1)`);
console.log(`   units:     ${units.length}`);
console.log(`   topics:    ${topicCount}`);
console.log(`   concepts:  ${conceptCount} (teaching items)`);
console.log(`   exercises: ${exerciseCount} (practice-test resources)`);
console.log(`\nReview the JSON, then run import.mjs to load into MongoDB.`);
