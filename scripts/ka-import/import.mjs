/**
 * import.mjs
 *
 * Idempotent MongoDB loader. Reads an extract JSON produced by
 * extract-content-from-ka.mjs and upserts the full hierarchy:
 *
 *   Strand → Unit → Topic → Concept + Resources + Questions
 *
 * Supports two JSON shapes:
 *   - Single topic:  { strand, unit, topic }           ← from extract-content-from-ka.mjs
 *   - Full course:   { strand, units: [{ topics }] }   ← from reconstruct.mjs
 *
 * Upsert key: kaSlug — every entity uses its kaSlug as the stable `id` in MongoDB.
 * Re-running is always safe.
 *
 * Usage:
 *   node import.mjs <json-file> [options]
 *
 * Options:
 *   --mongo <url>      MongoDB URL (default: mongodb://localhost:27017 or MONGO_URL env)
 *   --db <name>        Database name (default: prodigy or DB_NAME env)
 *   --dry-run          Print what would be written — no DB changes
 *   --skip-questions   Import hierarchy only, ignore questions in JSON
 *   --only-questions   Only upsert questions + update Resource links, skip hierarchy
 */

import { readFileSync, existsSync } from 'fs';
import { MongoClient } from 'mongodb';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? true;
}

const jsonFile      = args.find(a => !a.startsWith('--')) ?? null;
const mongoUrl      = flag('--mongo') || process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName        = flag('--db')    || process.env.DB_NAME   || 'prodigy';
const dryRun        = args.includes('--dry-run');
const skipQuestions = args.includes('--skip-questions');
const onlyQuestions = args.includes('--only-questions');

if (!jsonFile) {
  console.error('Usage: node import.mjs <json-file> [options]');
  process.exit(1);
}
if (!existsSync(jsonFile)) {
  console.error(`File not found: ${jsonFile}`);
  process.exit(1);
}

if (dryRun) console.log('[DRY RUN] No changes will be written to MongoDB\n');

const importDoc = JSON.parse(readFileSync(jsonFile, 'utf8'));

// ── Detect JSON shape ─────────────────────────────────────────────────────────
// Single-topic: has { strand, unit, topic }
// Full-course:  has { strand, units: [...] }

const isSingleTopic = !!importDoc.topic;
const isFullCourse  = Array.isArray(importDoc.units);

if (!isSingleTopic && !isFullCourse) {
  console.error('Unrecognised JSON shape — expected { strand, unit, topic } or { strand, units }');
  process.exit(1);
}

// Normalise to a list of { unit, topics[] } so the import loop is the same for both shapes
const unitBatches = isSingleTopic
  ? [{ unit: importDoc.unit, topics: [importDoc.topic] }]
  : importDoc.units.map(u => ({ unit: u, topics: u.topics ?? [] }));

const source = importDoc.strand.source ?? 'khan-academy';

// ── MongoDB ───────────────────────────────────────────────────────────────────

const client = new MongoClient(mongoUrl);
if (!dryRun) await client.connect();
const db = dryRun ? null : client.db(dbName);

const col = name => db?.collection(name);

// Helper: upsert by kaSlug (used as the stable `id` field). Returns kaSlug.
// preserve: array of field names to set only on insert — existing values are never overwritten.
let _dryId = 1;
async function upsert(collName, kaSlug, doc, { preserve = [] } = {}) {
  if (dryRun) {
    console.log(`  [upsert] ${collName} id=${kaSlug}`);
    return kaSlug ?? String(_dryId++);
  }
  const setFields    = { id: kaSlug };
  const insertFields = {};
  for (const [k, v] of Object.entries(doc)) {
    if (preserve.includes(k)) insertFields[k] = v;
    else setFields[k] = v;
  }
  const update = { $set: setFields };
  if (Object.keys(insertFields).length) update.$setOnInsert = insertFields;
  await col(collName).updateOne({ id: kaSlug }, update, { upsert: true });
  return kaSlug;
}

// ── Ensure indexes (idempotent) ───────────────────────────────────────────────

if (!dryRun) {
  for (const collName of ['strands', 'units', 'topics', 'concepts', 'resources', 'questions']) {
    const c = col(collName);
    try { await c.dropIndex('source_1_kaSlug_1'); } catch {}
    await c.createIndex({ id: 1 }, { unique: true });
    await c.createIndex({ source: 1, kaSlug: 1 }, { unique: true, sparse: true });
  }
}

// ── Counters ──────────────────────────────────────────────────────────────────

let nTopics = 0, nConcepts = 0, nResources = 0, nQuestions = 0;

// ── 1. Strand ─────────────────────────────────────────────────────────────────

let strandId;
if (!onlyQuestions) {
  const { strand } = importDoc;
  strandId = await upsert('strands', strand.kaSlug, {
    title:   strand.title,
    subject: strand.subject,
    kaSlug:  strand.kaSlug,
    source,
    weight:  null,
  });
  console.log(`✓ Strand: ${strand.title}`);
}

// ── 2. Units + Topics + Concepts + Resources + Questions ──────────────────────

// First pass over all units to get their IDs (needed for prerequisites)
const unitIdBySlug = {};

if (!onlyQuestions) {
  for (const { unit } of unitBatches) {
    unitIdBySlug[unit.kaSlug] = await upsert('units', unit.kaSlug, {
      title:         unit.title,
      description:   unit.description ?? null,
      kaSlug:        unit.kaSlug,
      source,
      strand:        strandId,
      order:         unit.order ?? 1,
      prerequisites: [],
    });
  }

  // Sequential prerequisites for full-course imports
  if (isFullCourse) {
    for (let i = 1; i < unitBatches.length; i++) {
      const cur  = unitBatches[i].unit;
      const prev = unitBatches[i - 1].unit;
      if (!dryRun) {
        await col('units').updateOne(
          { id: unitIdBySlug[cur.kaSlug] },
          { $set: { prerequisites: [unitIdBySlug[prev.kaSlug]] } }
        );
      }
    }
  }
  console.log(`✓ Units: ${unitBatches.length}`);
}

// ── Per-topic loop ────────────────────────────────────────────────────────────

for (const { unit, topics } of unitBatches) {
  const unitId = unitIdBySlug[unit.kaSlug];

  for (const topic of topics) {

    // ── Topic ────────────────────────────────────────────────────────────────
    let topicId;
    if (!onlyQuestions) {
      topicId = await upsert('topics', topic.kaSlug, {
        title:        topic.title,
        description:  topic.description ?? null,
        kaSlug:       topic.kaSlug,
        source,
        unit:         unitId,
        order:        topic.order ?? 1,
        probingTree:  null,
        practiceTests: [],
      });
      nTopics++;
    } else {
      if (!dryRun) {
        const t = await col('topics').findOne({ kaSlug: topic.kaSlug, source });
        topicId = t?.id ?? null;
      }
    }

    // ── Concepts (rich format) → Resource + Concept ──────────────────────────
    // Handles topic.concepts[] — hand-authored format with inline resources,
    // probingTree, masteryQuestions, and kaSlug-based cross-refs.

    if (!onlyQuestions && (topic.concepts ?? []).length > 0) {
      for (let idx = 0; idx < topic.concepts.length; idx++) {
        const concept = topic.concepts[idx];

        // Upsert inline resources from lessonPlan
        const lessonPlan = [];
        for (const step of (concept.lessonPlan ?? [])) {
          const resourceIds = [];
          for (const res of (step.resources ?? [])) {
            const resKaSlug = res.kaSlug ?? concept.kaSlug;
            const resDoc = {
              title:       res.title,
              type:        res.type,
              source,
              description: res.description ?? null,
              url:         res.url ?? null,
              kaSlug:      resKaSlug,
            };
            if (res.type === 'teaching-video') {
              resDoc.youtubeId  = res.youtubeId  ?? null;
              resDoc.youtubeUrl = res.youtubeUrl ?? null;
              resDoc.duration   = res.duration   ?? null;
              resDoc.thumbnail  = res.thumbnail  ?? null;
              resDoc.cfuMarkers = res.cfuMarkers ?? [];
            }
            const resId = await upsert('resources', resKaSlug, resDoc);
            resourceIds.push(resId);
            nResources++;
          }
          lessonPlan.push({ type: step.type, instruction: step.instruction ?? null, resources: resourceIds, learningIndicator: null });
        }

        // Upsert mastery question resources
        const masteryQuestionIds = [];
        for (const mq of (concept.masteryQuestions ?? [])) {
          const mqId = await upsert('resources', mq.kaSlug, {
            title:       mq.title,
            type:        mq.type ?? 'practice-test',
            source,
            kaSlug:      mq.kaSlug,
            url:         mq.url ?? null,
            description: null,
          });
          masteryQuestionIds.push(mqId);
          nResources++;
        }

        // prerequisites and probingTree use kaSlug directly — no resolution needed.
        // probingTree and misconceptions are hand-authored — preserve on update. supportedPhases is importer-derived.
        const hasPractice = masteryQuestionIds.length > 0;
        const supportedPhases = ['learn', ...(hasPractice ? ['master'] : [])];

        await upsert('concepts', concept.kaSlug, {
          title:             concept.title,
          kaSlug:            concept.kaSlug,
          source,
          topic:             topicId,
          order:             concept.order ?? idx + 1,
          prerequisites:     concept.prerequisites ?? [],
          nextConcepts:      [],
          boards:            concept.boards            ?? [],
          classApplicableTo: concept.classApplicableTo ?? [],
          conceptWeightage:  concept.conceptWeightage  ?? null,
          misconceptions:    concept.misconceptions    ?? [],
          probingTree:       concept.probingTree       ?? null,
          masteryQuestions:  masteryQuestionIds,
          examQuestions:     concept.examQuestions     ?? [],
          supportedPhases,
          lessonPlan,
        }, { preserve: ['probingTree', 'misconceptions'] });
        nConcepts++;
      }

      // Wire sequential nextConcepts for concepts[] format (same as teachingItems does)
      const conceptSlugs = (topic.concepts ?? []).map(c => c.kaSlug);
      for (let i = 0; i < conceptSlugs.length - 1; i++) {
        if (!dryRun) {
          await col('concepts').updateOne(
            { id: conceptSlugs[i] },
            { $set: { nextConcepts: [conceptSlugs[i + 1]] } }
          );
        } else {
          console.log(`  [nextConcepts] ${conceptSlugs[i]} → ${conceptSlugs[i + 1]}`);
        }
      }
    }

    // ── Teaching items → Resource + Concept ──────────────────────────────────
    const conceptIds = [];
    const topicHasPractice = (topic.exerciseItems ?? []).length > 0;

    if (!onlyQuestions) {
      for (let idx = 0; idx < (topic.teachingItems ?? []).length; idx++) {
        const item = topic.teachingItems[idx];

        const resourceDoc = {
          title:       item.title,
          type:        item.type,
          source,
          description: item.description ?? null,
          url:         item.url ?? null,
          kaSlug:      item.kaSlug,
        };
        if (item.type === 'teaching-video') {
          resourceDoc.youtubeId  = item.youtubeId  ?? null;
          resourceDoc.youtubeUrl = item.youtubeUrl ?? null;
          resourceDoc.duration   = item.duration   ?? null;
          resourceDoc.thumbnail  = item.thumbnail  ?? null;
          resourceDoc.cfuMarkers = item.cfuMarkers ?? [];
        }
        await upsert('resources', item.kaSlug, resourceDoc);
        nResources++;

        await upsert('concepts', item.kaSlug, {
          title:             item.title,
          kaSlug:            item.kaSlug,
          source,
          topic:             topicId,
          order:             idx + 1,
          prerequisites:     [],
          nextConcepts:      [],
          boards:            [],
          classApplicableTo: [],
          conceptWeightage:  null,
          misconceptions:    [],
          probingTree:       null,
          masteryQuestions:  [],
          examQuestions:     [],
          supportedPhases:   ['learn', ...(topicHasPractice ? ['master'] : [])],
          lessonPlan: [{ type: 'ido', instruction: null, resources: [item.kaSlug], learningIndicator: null }],
        }, { preserve: ['probingTree', 'misconceptions'] });
        conceptIds.push(item.kaSlug);
        nConcepts++;
      }

      // Sequential prerequisites + nextConcepts within topic
      for (let i = 1; i < conceptIds.length; i++) {
        if (!dryRun) {
          await col('concepts').updateOne(
            { id: conceptIds[i] },
            { $set: { prerequisites: [conceptIds[i - 1]] } }
          );
        }
      }
      for (let i = 0; i < conceptIds.length - 1; i++) {
        if (!dryRun) {
          await col('concepts').updateOne(
            { id: conceptIds[i] },
            { $set: { nextConcepts: [conceptIds[i + 1]] } }
          );
        }
      }
    }

    // ── Exercise items → practice-test Resources + Questions ──────────────────
    const practiceTestIds = [];

    for (const item of (topic.exerciseItems ?? [])) {
      let resourceId;

      if (!onlyQuestions) {
        resourceId = item.kaSlug;
        await upsert('resources', item.kaSlug, {
          title:       item.title,
          type:        'practice-test',
          source,
          description: item.description ?? null,
          url:         item.url ?? null,
          kaSlug:      item.kaSlug,
          questions:   [],
        });
        practiceTestIds.push(resourceId);
        nResources++;
      } else {
        if (!dryRun) {
          const r = await col('resources').findOne({ kaSlug: item.kaSlug, source });
          resourceId = r?.id ?? null;
        }
      }

      // Questions
      if (!skipQuestions && (item.questions ?? []).length > 0) {
        const questionIds = [];
        for (const q of item.questions) {
          const qId = await upsert('questions', q.kaSlug, {
            type:            q.type ?? 'perseus',
            source,
            kaSlug:          q.kaSlug,
            perseusContent:  q.perseusContent ?? null,
            difficultyLevel: q.difficultyLevel ?? null,
            appearedInExams: [],
            relatedQuestions: [],
            teachingTree:    null,
          });
          questionIds.push(qId);
          nQuestions++;
        }
        if (!dryRun && resourceId) {
          await col('resources').updateOne(
            { id: resourceId },
            { $set: { questions: questionIds } }
          );
        }
      }
    }

    // Link practice tests to topic
    if (!onlyQuestions && practiceTestIds.length > 0 && !dryRun) {
      await col('topics').updateOne(
        { id: topicId },
        { $set: { practiceTests: practiceTestIds } }
      );
    }
  }
}

if (!dryRun) await client.close();

// ── Summary ───────────────────────────────────────────────────────────────────

const mode = onlyQuestions ? 'questions only' : skipQuestions ? 'hierarchy only' : 'full';
console.log(`\n✅ Import complete${dryRun ? ' [DRY RUN]' : ''} — db: ${dbName} | mode: ${mode}`);
if (!onlyQuestions) {
  console.log(`   strand:    1`);
  console.log(`   units:     ${unitBatches.length}`);
  console.log(`   topics:    ${nTopics}`);
  console.log(`   concepts:  ${nConcepts}`);
  console.log(`   resources: ${nResources}`);
}
if (!skipQuestions) console.log(`   questions: ${nQuestions}`);
