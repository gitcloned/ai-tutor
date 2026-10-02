#!/usr/bin/env node
/**
 * Prodigy data migration script
 *
 * Steps:
 *   subjects  — create Subject docs from strand.subject text; backfill strand.subjectId
 *   journeys  — backfill learning_journey.subjectId; split multi-subject journeys
 *   nodes     — backfill learning_journey_node.topicId from concept→topic CMS chain
 *   sessions  — backfill session.originTopicId from journeyNode.topicId
 *   all       — run all steps in order (default)
 *
 * Usage (from repo root, run inside cms/packages/backend to get node_modules):
 *   cd cms/packages/backend && node ../../scripts/migrate.mjs [--write] [--step <step>]
 *
 * OR from repo root with explicit node_modules path:
 *   NODE_PATH=cms/packages/backend/node_modules node cms/scripts/migrate.mjs [--write]
 *
 * Environment:
 *   MONGO_URL  (default: mongodb://localhost:27017)
 *   DB_NAME    (default: prodigy)
 *
 * Default is dry-run. Pass --write to apply changes.
 * A rerun in --write mode makes no additional changes (idempotent).
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { randomBytes }              from 'crypto';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// Load .env if present (tries cwd first, then backend package dir)
for (const envPath of ['.env', '../../.env']) {
  if (existsSync(envPath)) {
    try {
      for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0 && !line.startsWith('#')) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim();
          if (k) process.env[k] ??= v;
        }
      }
    } catch {}
    break;
  }
}

const args    = process.argv.slice(2);
const DRY     = !args.includes('--write');
const stepArg = args.find(a => a.startsWith('--step='))?.split('=')[1]
              ?? args[args.indexOf('--step') + 1]
              ?? 'all';

const VALID_STEPS = ['subjects', 'journeys', 'nodes', 'sessions', 'all'];
if (!VALID_STEPS.includes(stepArg)) {
  console.error(`Unknown step '${stepArg}'. Valid: ${VALID_STEPS.join(', ')}`);
  process.exit(1);
}

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   ?? 'prodigy';

function newId() { return randomBytes(12).toString('hex'); }

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Convert a stored reference (ObjectId or string) to a plain string for id-field lookups. */
function refToString(ref) {
  if (!ref) return null;
  return typeof ref === 'object' && ref.toString ? ref.toString() : String(ref);
}

/** Build a lookup map from an array of docs keyed by a string field. */
function buildMap(docs, keyField) {
  const m = new Map();
  for (const d of docs) {
    const k = refToString(d[keyField]);
    if (k) m.set(k, d);
  }
  return m;
}

const STATE_ORDER = ['not_assessed','assessing','learning','clarity','mastering','mastered','getting_exam_ready','exam_ready','learn-pre-req-before'];
function stateRank(s) { const i = STATE_ORDER.indexOf(s); return i === -1 ? -1 : i; }

// ── Step 1: Subjects ──────────────────────────────────────────────────────────

async function stepSubjects({ strands, subjects }, report) {
  console.log('\n── Step: subjects ──');

  // Find all distinct strand.subject values
  const allStrands = await strands.find({}, { projection: { id: 1, subject: 1, subjectId: 1 } }).toArray();
  const uniqueSubjectTitles = [...new Set(allStrands.map(s => s.subject).filter(Boolean))];
  console.log(`  Distinct strand.subject values: ${uniqueSubjectTitles.length}`);
  if (uniqueSubjectTitles.length === 0) {
    report.push('subjects: no strand.subject values found — nothing to do');
    return;
  }

  // Existing subjects by title
  const existingSubjects = await subjects.find({}).toArray();
  const subjectByTitle = new Map(existingSubjects.map(s => [s.title, s]));

  let created = 0;
  let skipped = 0;

  for (const title of uniqueSubjectTitles) {
    if (subjectByTitle.has(title)) {
      skipped++;
      console.log(`  [skip] Subject exists: "${title}" (id: ${subjectByTitle.get(title).id})`);
    } else {
      const id = newId();
      console.log(`  [${DRY ? 'dry' : 'write'}] Create Subject: "${title}" id=${id}`);
      // In dry-run, still populate map so strand backfill simulation is accurate.
      subjectByTitle.set(title, { id, title });
      if (!DRY) {
        await subjects.insertOne({ id, title });
      }
      created++;
    }
  }

  // Reload in write mode after creation to pick up any concurrent inserts.
  if (!DRY && created > 0) {
    const fresh = await subjects.find({}).toArray();
    for (const s of fresh) subjectByTitle.set(s.title, s);
  }

  // Backfill strand.subjectId
  // proposedStrandSubjectIds: strandId → subjectId (for dry-run simulation)
  const proposedStrandSubjectIds = new Map();
  let strandUpdated = 0;
  let strandSkipped = 0;
  let strandUnresolved = 0;

  for (const strand of allStrands) {
    if (strand.subjectId) {
      proposedStrandSubjectIds.set(strand.id, strand.subjectId);
      strandSkipped++;
      continue;
    }
    const subject = subjectByTitle.get(strand.subject);
    if (!subject) {
      console.log(`  [warn] Strand id=${strand.id} subject="${strand.subject}" — no subject found`);
      strandUnresolved++;
      continue;
    }
    console.log(`  [${DRY ? 'dry' : 'write'}] strand.id=${strand.id}: subjectId=${subject.id}`);
    proposedStrandSubjectIds.set(strand.id, subject.id);
    if (!DRY) {
      await strands.updateOne({ id: strand.id }, { $set: { subjectId: subject.id } });
    }
    strandUpdated++;
  }

  report.push(`subjects: created=${created}, existing=${skipped}; strands updated=${strandUpdated}, already-set=${strandSkipped}, unresolved=${strandUnresolved}`);
  return proposedStrandSubjectIds;
}

// ── Step 2: Journeys ──────────────────────────────────────────────────────────

/**
 * Build a map from concept.id → subjectId by traversing concept→topic→unit→strand→subject.
 * Uses string-ID lookups to handle both ObjectId and string refs (KA import pattern).
 * `proposedStrandSubjectIds` merges proposed (dry-run) subjectIds with DB values.
 */
async function buildConceptSubjectMap({ concepts, topics, units, strands, subjects }, proposedStrandSubjectIds = new Map()) {
  const allConcepts = await concepts.find({}, { projection: { id: 1, topic: 1 } }).toArray();
  const allTopics   = await topics.find({}, { projection: { id: 1, unit: 1 } }).toArray();
  const allUnits    = await units.find({}, { projection: { id: 1, strand: 1 } }).toArray();
  const allStrands  = await strands.find({}, { projection: { id: 1, subjectId: 1 } }).toArray();
  const allSubjects = await subjects.find({}).toArray();

  const topicById   = buildMap(allTopics,   'id');
  const unitById    = buildMap(allUnits,    'id');
  const strandById  = buildMap(allStrands,  'id');
  const subjectById = buildMap(allSubjects, 'id');

  const map = new Map(); // conceptId → subjectId
  for (const c of allConcepts) {
    const topicId  = refToString(c.topic);
    const topic    = topicId  ? topicById.get(topicId)  : null;
    const unitId   = refToString(topic?.unit);
    const unit     = unitId   ? unitById.get(unitId)   : null;
    const strandId = refToString(unit?.strand);
    const strand   = strandId ? strandById.get(strandId) : null;
    // Use proposed subjectId from dry-run simulation or actual DB value
    const subjectId = proposedStrandSubjectIds.get(strandId) ?? strand?.subjectId ?? null;
    if (subjectId) {
      map.set(c.id, subjectId);
    }
  }
  return map;
}

/**
 * Also build conceptId → topicId for node backfill.
 */
async function buildConceptTopicMap({ concepts, topics }) {
  const allConcepts = await concepts.find({}, { projection: { id: 1, topic: 1 } }).toArray();
  const allTopics   = await topics.find({}, { projection: { id: 1 } }).toArray();
  const topicById   = buildMap(allTopics, 'id');

  const map = new Map(); // conceptId → topicId
  for (const c of allConcepts) {
    const topicId = refToString(c.topic);
    if (topicId && topicById.has(topicId)) {
      map.set(c.id, topicId);
    }
  }
  return map;
}

async function stepJourneys({ journeys, nodes, concepts, topics, units, strands, subjects }, report, proposedStrandSubjectIds = new Map()) {
  console.log('\n── Step: journeys ──');

  const conceptSubjectMap = await buildConceptSubjectMap({ concepts, topics, units, strands, subjects }, proposedStrandSubjectIds);
  console.log(`  Concept→subject mappings resolved: ${conceptSubjectMap.size}`);

  // Find journeys without subjectId
  const oldJourneys = await journeys.find({ subjectId: { $in: [null, undefined, ''] } }).toArray();
  console.log(`  Journeys without subjectId: ${oldJourneys.length}`);

  if (oldJourneys.length === 0) {
    report.push('journeys: all journeys already have subjectId — nothing to do');
    return;
  }

  let updated = 0;
  let split = 0;
  let unresolved = 0;
  let merged = 0;

  for (const journey of oldJourneys) {
    const journeyNodes = await nodes.find({ journeyId: journey.id }).toArray();

    if (journeyNodes.length === 0) {
      // Empty journey — assign a placeholder or skip; report it
      console.log(`  [warn] Journey id=${journey.id} studentId=${journey.studentId} has no nodes — skipping`);
      unresolved++;
      continue;
    }

    // Determine subjectId for each node
    const nodesBySubject = new Map(); // subjectId → [node]
    const unresolvedNodes = [];

    for (const node of journeyNodes) {
      const subjectId = conceptSubjectMap.get(node.conceptId);
      if (!subjectId) {
        unresolvedNodes.push(node);
        continue;
      }
      if (!nodesBySubject.has(subjectId)) nodesBySubject.set(subjectId, []);
      nodesBySubject.get(subjectId).push(node);
    }

    if (nodesBySubject.size === 0) {
      console.log(`  [warn] Journey id=${journey.id} — no nodes could be mapped to a subject (${unresolvedNodes.length} unresolved)`);
      unresolved++;
      continue;
    }

    if (unresolvedNodes.length > 0) {
      console.log(`  [warn] Journey id=${journey.id} — ${unresolvedNodes.length} nodes could not be mapped to a subject`);
    }

    // The subject with the most nodes becomes the "primary" subject for this journey
    const sorted = [...nodesBySubject.entries()].sort((a, b) => b[1].length - a[1].length);

    for (let i = 0; i < sorted.length; i++) {
      const [subjectId, subjectNodes] = sorted[i];

      if (i === 0) {
        // Primary: update this journey's subjectId in-place
        // Check if there's already a journey for this student+subject
        const existing = await journeys.findOne({ studentId: journey.studentId, subjectId });
        if (existing && existing.id !== journey.id) {
          // Merge: move nodes to existing journey, delete this one
          console.log(`  [${DRY ? 'dry' : 'write'}] Merge journey id=${journey.id} → existing id=${existing.id} (studentId=${journey.studentId}, subjectId=${subjectId})`);
          for (const node of subjectNodes) {
            // Check for duplicate concept in destination journey
            const dup = await nodes.findOne({ journeyId: existing.id, conceptId: node.conceptId });
            if (dup) {
              // Keep whichever has higher state or more recent activity; sessions reference nodeId directly
              const keepNode = pickBetterNode(node, dup);
              const dropId = keepNode.id === node.id ? dup.id : node.id;
              console.log(`    [${DRY ? 'dry' : 'write'}] Duplicate node concept=${node.conceptId}: keep=${keepNode.id}, drop=${dropId}`);
              if (!DRY) {
                await nodes.deleteOne({ id: dropId });
                if (keepNode.id === node.id) {
                  await nodes.updateOne({ id: node.id }, { $set: { journeyId: existing.id } });
                }
              }
            } else {
              console.log(`    [${DRY ? 'dry' : 'write'}] Move node id=${node.id} concept=${node.conceptId} → journey ${existing.id}`);
              if (!DRY) {
                await nodes.updateOne({ id: node.id }, { $set: { journeyId: existing.id } });
              }
            }
          }
          if (!DRY) await journeys.deleteOne({ id: journey.id });
          merged++;
        } else {
          console.log(`  [${DRY ? 'dry' : 'write'}] Journey id=${journey.id} studentId=${journey.studentId}: subjectId=${subjectId}`);
          if (!DRY) {
            await journeys.updateOne({ id: journey.id }, { $set: { subjectId } });
          }
          updated++;
        }
      } else {
        // Additional subjects — create a new journey for each
        const existingForSubject = await journeys.findOne({ studentId: journey.studentId, subjectId });
        let targetJourneyId;

        if (existingForSubject) {
          targetJourneyId = existingForSubject.id;
          console.log(`  [${DRY ? 'dry' : 'write'}] Reuse existing journey id=${existingForSubject.id} for studentId=${journey.studentId}, subjectId=${subjectId}`);
        } else {
          targetJourneyId = newId();
          console.log(`  [${DRY ? 'dry' : 'write'}] Create journey id=${targetJourneyId} for studentId=${journey.studentId}, subjectId=${subjectId} (split from ${journey.id})`);
          if (!DRY) {
            await journeys.insertOne({
              id:        targetJourneyId,
              studentId: journey.studentId,
              subjectId,
              objective: journey.objective ?? 'Learn subject',
              createdAt: new Date(),
            });
          }
          split++;
        }

        // Move nodes to the target journey
        for (const node of subjectNodes) {
          const dup = existingForSubject ? await nodes.findOne({ journeyId: targetJourneyId, conceptId: node.conceptId }) : null;
          if (dup) {
            const keepNode = pickBetterNode(node, dup);
            const dropId = keepNode.id === node.id ? dup.id : node.id;
            console.log(`    [${DRY ? 'dry' : 'write'}] Duplicate concept=${node.conceptId}: keep=${keepNode.id}, drop=${dropId}`);
            if (!DRY) {
              await nodes.deleteOne({ id: dropId });
              if (keepNode.id === node.id) {
                await nodes.updateOne({ id: node.id }, { $set: { journeyId: targetJourneyId } });
              }
            }
          } else {
            console.log(`    [${DRY ? 'dry' : 'write'}] Move node id=${node.id} concept=${node.conceptId} → journey ${targetJourneyId}`);
            if (!DRY) {
              await nodes.updateOne({ id: node.id }, { $set: { journeyId: targetJourneyId } });
            }
          }
        }
      }
    }
  }

  report.push(`journeys: updated=${updated}, split-created=${split}, merged=${merged}, unresolved=${unresolved}`);
}

/** When two nodes exist for the same (journeyId, conceptId), pick the one to keep. */
function pickBetterNode(a, b) {
  const ra = stateRank(a.state);
  const rb = stateRank(b.state);
  if (ra !== rb) return ra > rb ? a : b;
  // Same state — pick more recently active
  const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
  const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
  return ta >= tb ? a : b;
}

// ── Step 3: Node topicId backfill ─────────────────────────────────────────────

async function stepNodes({ nodes, concepts, topics }, report) {
  console.log('\n── Step: nodes ──');

  const conceptTopicMap = await buildConceptTopicMap({ concepts, topics });
  console.log(`  Concept→topic mappings resolved: ${conceptTopicMap.size}`);

  const nodesWithoutTopic = await nodes.find({ topicId: { $in: [null, undefined, ''] } }).toArray();
  console.log(`  Nodes without topicId: ${nodesWithoutTopic.length}`);

  if (nodesWithoutTopic.length === 0) {
    report.push('nodes: all nodes already have topicId — nothing to do');
    return;
  }

  let updated = 0;
  let unresolved = 0;

  for (const node of nodesWithoutTopic) {
    const topicId = conceptTopicMap.get(node.conceptId);
    if (!topicId) {
      console.log(`  [warn] Node id=${node.id} concept=${node.conceptId} — no topic found`);
      unresolved++;
      continue;
    }
    console.log(`  [${DRY ? 'dry' : 'write'}] node.id=${node.id} concept=${node.conceptId}: topicId=${topicId}`);
    if (!DRY) {
      await nodes.updateOne({ id: node.id }, { $set: { topicId } });
    }
    updated++;
  }

  report.push(`nodes: updated=${updated}, unresolved=${unresolved}`);
}

// ── Step 4: Session originTopicId backfill ────────────────────────────────────

async function stepSessions({ sessions, nodes }, report) {
  console.log('\n── Step: sessions ──');

  const sessionsWithoutOrigin = await sessions.find({ originTopicId: { $in: [null, undefined, ''] } }).toArray();
  console.log(`  Sessions without originTopicId: ${sessionsWithoutOrigin.length}`);

  if (sessionsWithoutOrigin.length === 0) {
    report.push('sessions: all sessions already have originTopicId — nothing to do');
    return;
  }

  // Build nodeId → topicId map for efficiency
  const nodeIds = [...new Set(sessionsWithoutOrigin.map(s => s.journeyNodeId).filter(Boolean))];
  const relatedNodes = nodeIds.length > 0
    ? await nodes.find({ id: { $in: nodeIds } }, { projection: { id: 1, topicId: 1 } }).toArray()
    : [];
  const nodeTopicMap = new Map(relatedNodes.map(n => [n.id, n.topicId]));

  let updated = 0;
  let unresolved = 0;

  for (const session of sessionsWithoutOrigin) {
    const topicId = nodeTopicMap.get(session.journeyNodeId);
    if (!topicId) {
      // Node may not have topicId yet (run nodes step first) or node is missing
      unresolved++;
      continue;
    }
    console.log(`  [${DRY ? 'dry' : 'write'}] session.id=${session.id}: originTopicId=${topicId}`);
    if (!DRY) {
      await sessions.updateOne({ id: session.id }, { $set: { originTopicId: topicId } });
    }
    updated++;
  }

  if (unresolved > 0) {
    console.log(`  [warn] ${unresolved} sessions could not be resolved (node missing topicId — run nodes step first)`);
  }
  report.push(`sessions: updated=${updated}, unresolved=${unresolved}`);
}

// ── Verify ────────────────────────────────────────────────────────────────────

async function verify({ strands, subjects, journeys, nodes, sessions }) {
  console.log('\n── Verification ──');

  const strandsWithoutSubjectId = await strands.countDocuments({ subjectId: { $in: [null, ''] } });
  const journeysWithoutSubjectId = await journeys.countDocuments({ subjectId: { $in: [null, undefined, ''] } });
  const nodesWithoutTopicId = await nodes.countDocuments({ topicId: { $in: [null, ''] } });
  const sessionsWithoutOrigin = await sessions.countDocuments({ originTopicId: { $in: [null, ''] } });

  console.log(`  strands without subjectId:   ${strandsWithoutSubjectId}`);
  console.log(`  journeys without subjectId:  ${journeysWithoutSubjectId}`);
  console.log(`  nodes without topicId:       ${nodesWithoutTopicId}`);
  console.log(`  sessions without originTopicId: ${sessionsWithoutOrigin}`);

  // Check for orphan journey nodes (journeyId points to non-existent journey)
  const allJourneyIds = new Set((await journeys.find({}, { projection: { id: 1 } }).toArray()).map(j => j.id));
  const allNodes = await nodes.find({}, { projection: { id: 1, journeyId: 1 } }).toArray();
  const orphanNodes = allNodes.filter(n => !allJourneyIds.has(n.journeyId));
  console.log(`  orphan journey nodes: ${orphanNodes.length}`);
  if (orphanNodes.length > 0) {
    for (const n of orphanNodes.slice(0, 5)) {
      console.log(`    node.id=${n.id} journeyId=${n.journeyId} (journey not found)`);
    }
  }

  // Report topics with no recommendedGrades set
  // (we don't auto-assign grades — just report the count)
  return {
    strandsWithoutSubjectId,
    journeysWithoutSubjectId,
    nodesWithoutTopicId,
    sessionsWithoutOrigin,
    orphanNodes: orphanNodes.length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nProdigy Migration`);
  console.log(`  Mode:    ${DRY ? 'DRY RUN (pass --write to apply changes)' : 'WRITE'}`);
  console.log(`  Step:    ${stepArg}`);
  console.log(`  MongoDB: ${MONGO_URL}/${DB_NAME}`);

  // Dynamic import of mongoose — resolve relative to cwd so pnpm workspace packages work.
  let mongoose;
  const candidates = [
    process.cwd(),
    new URL('../packages/backend', import.meta.url).pathname,
  ];
  for (const dir of candidates) {
    try {
      const req = createRequire(dir + '/package.json');
      mongoose = req('mongoose');
      break;
    } catch {}
  }
  if (!mongoose) {
    console.error('\nCould not import mongoose. Run this script from cms/packages/backend:');
    console.error('  cd cms/packages/backend && node ../../scripts/migrate.mjs [--write]');
    process.exit(1);
  }

  await mongoose.connect(`${MONGO_URL}/${DB_NAME}`);
  console.log(`  Connected.\n`);

  const db       = mongoose.connection.db;
  const strands  = db.collection('strands');
  const topics   = db.collection('topics');
  const units    = db.collection('units');
  const concepts = db.collection('concepts');
  const subjects = db.collection('subjects');
  const journeys = db.collection('learning_journeys');
  const nodes    = db.collection('learning_journey_nodes');
  const sessions = db.collection('sessions');

  const cols = { strands, topics, units, concepts, subjects, journeys, nodes, sessions };

  const report = [];

  // proposedStrandSubjectIds: carries dry-run simulation of strand.subjectId updates
  // from the subjects step so the journeys step can resolve concept→subject correctly.
  let proposedStrandSubjectIds = new Map();

  if (['all', 'subjects'].includes(stepArg)) {
    proposedStrandSubjectIds = await stepSubjects(cols, report) ?? proposedStrandSubjectIds;
  }
  if (['all', 'journeys'].includes(stepArg)) await stepJourneys(cols, report, proposedStrandSubjectIds);
  if (['all', 'nodes'].includes(stepArg))    await stepNodes(cols, report);
  if (['all', 'sessions'].includes(stepArg)) await stepSessions(cols, report);

  const vr = await verify(cols);

  console.log('\n=== Summary ===');
  for (const line of report) console.log(`  ${line}`);

  if (DRY) {
    console.log('\n[DRY RUN] No changes written. Re-run with --write to apply.');
  } else {
    if (vr.strandsWithoutSubjectId + vr.journeysWithoutSubjectId + vr.orphanNodes === 0) {
      console.log('\n[OK] Migration complete — no unresolved items.');
    } else {
      console.log('\n[WARN] Some items remain unresolved — check output above.');
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
