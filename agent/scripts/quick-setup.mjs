#!/usr/bin/env node
/**
 * quick-setup.mjs — create / reset demo student profiles for manual testing.
 *
 * Reads all *.json files from agent/quick_setups/, recreates each student
 * (deletes if already exists), creates one shared classroom with the topic
 * enrolled, and plants journey nodes at the configured states.
 *
 * Usage (run from repo root or agent/ directory):
 *   node scripts/quick-setup.mjs
 *   node scripts/quick-setup.mjs --class "Dev Classroom"
 *   node scripts/quick-setup.mjs --profile expert          # single profile
 *
 * Services must be running: CMS (32001), LP (32002), ERP (32005).
 *
 * Profile JSON format (agent/quick_setups/<name>.json):
 *   {
 *     "name": "Student Name",
 *     "grade": "Grade 7",
 *     "flushSessions": true,
 *     "concepts": [
 *       { "concept": "<conceptId>", "state": "<state>" }
 *     ]
 *   }
 *
 * An empty "concepts" array = student enrolled only, no journey nodes.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LP  = process.env.LP_URL  ?? 'http://localhost:32002';
const CMS = process.env.CMS_URL ?? 'http://localhost:32001';
const ERP = process.env.ERP_URL ?? 'http://localhost:32005';

const args = process.argv.slice(2);
const isTTY = process.stdout.isTTY;

const c = {
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
  cyan:   s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
};

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function lpGet(path) {
  const r = await fetch(`${LP}${path}`);
  if (!r.ok) throw new Error(`GET ${LP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function lpPost(path, body) {
  const r = await fetch(`${LP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${LP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function lpPatch(path, body) {
  const r = await fetch(`${LP}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${LP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function cmsGet(path) {
  const r = await fetch(`${CMS}${path}`);
  if (!r.ok) throw new Error(`GET ${CMS}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function erpGet(path) {
  const r = await fetch(`${ERP}${path}`);
  if (!r.ok) throw new Error(`GET ${ERP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function erpPost(path, body) {
  const r = await fetch(`${ERP}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    throw new Error(`POST ${ERP}${path} → ${r.status} ${msg}`);
  }
  return r.json();
}

async function erpDel(path) {
  const r = await fetch(`${ERP}${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${ERP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

const TRANSITION_STATES = new Set(['assessing', 'learning', 'mastering', 'getting_exam_ready']);

async function setupOne(studentId, conceptId, state, { topicHint, flushSessions, journeyCache }) {
  // 1. Resolve concept from CMS
  const concept = await cmsGet(`/concepts/${conceptId}`);
  const topicId = topicHint ?? concept.topic ?? null;
  if (!topicId) throw new Error(`Concept "${conceptId}" has no topic in CMS.`);

  // 2. Resolve subjectId from topic (cached)
  if (!journeyCache.subjectByTopic.has(topicId)) {
    const info = await cmsGet(`/topics/${topicId}/subject`);
    journeyCache.subjectByTopic.set(topicId, info.subjectId);
  }
  const subjectId = journeyCache.subjectByTopic.get(topicId);

  // 3. Find or create the subject journey (cached)
  if (!journeyCache.journeyBySubject.has(subjectId)) {
    if (!journeyCache.allJourneys) {
      journeyCache.allJourneys = await lpGet(`/students/${studentId}/journeys`).catch(() => []);
    }
    let journey = journeyCache.allJourneys.find(j => j.subjectId === subjectId);
    if (!journey) {
      journey = await lpPost(`/students/${studentId}/journeys`, { objective: 'Learn subject', subjectId });
      journeyCache.allJourneys.push(journey);
    }
    journeyCache.journeyBySubject.set(subjectId, journey);
  }
  const journey = journeyCache.journeyBySubject.get(subjectId);

  // 4. Find or create the journey node
  const existingNodes = await lpGet(`/journey-nodes?journeyId=${journey.id}&conceptId=${conceptId}`).catch(() => []);
  let node = existingNodes[0];
  let nodeAction;
  if (!node) {
    const goTo = concept.nextConcepts?.[0] ?? null;
    node = await lpPost('/journey-nodes', {
      journeyId: journey.id, conceptId,
      order: 1, state, masteryLevel: null,
      goTo, cameFrom: null, preReqToLearn: null,
      topicId, lastActivity: new Date().toISOString(),
    });
    nodeAction = 'created';
  } else {
    await lpPatch(`/journey-nodes/${node.id}`, { state, lastActivity: new Date().toISOString() });
    node.state = state;
    nodeAction = 'patched';
  }

  // 5. Handle sessions
  let sessionNote;
  if (flushSessions) {
    const sessions = await lpGet(`/students/${studentId}/sessions?conceptId=${encodeURIComponent(conceptId)}&status=started`).catch(() => []);
    for (const s of sessions) {
      await lpPatch(`/sessions/${s.id}`, { status: 'completed', endedAt: new Date().toISOString() }).catch(() => {});
    }
    sessionNote = sessions.length > 0 ? `flushed ${sessions.length} session(s)` : 'none to flush';
  } else if (TRANSITION_STATES.has(state)) {
    const sessions = await lpGet(`/students/${studentId}/sessions?conceptId=${encodeURIComponent(conceptId)}&status=started`).catch(() => []);
    const resumable = sessions.find(s => s.journeyNodeId === node.id && s.conceptStateAtStart === state);
    sessionNote = resumable ? `will resume session ${resumable.id}` : 'fresh start';
  }

  return { concept, topicId, subjectId, journey, node, nodeAction, sessionNote };
}

// ── Classroom helpers ─────────────────────────────────────────────────────────

/**
 * Collect all unique {topicId, subjectId} pairs across all profiles.
 * Used to create the classroom with the right topic assignments.
 */
async function resolveClassroomTopics(profiles) {
  const topicMap = new Map(); // topicId → subjectId
  const subjectCache = new Map();

  for (const profile of profiles) {
    for (const entry of profile.concepts ?? []) {
      const concept = await cmsGet(`/concepts/${entry.concept}`).catch(() => null);
      if (!concept) continue;
      const topicId = entry.topic ?? concept.topic ?? null;
      if (!topicId || topicMap.has(topicId)) continue;

      if (!subjectCache.has(topicId)) {
        const info = await cmsGet(`/topics/${topicId}/subject`).catch(() => null);
        if (info?.subjectId) subjectCache.set(topicId, info.subjectId);
      }
      const subjectId = subjectCache.get(topicId);
      if (subjectId) topicMap.set(topicId, subjectId);
    }
  }

  return Array.from(topicMap.entries()).map(([topicId, subjectId]) => ({ topicId, subjectId }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const className   = flag('class') ?? 'Dev Classroom';
  const profileArg  = flag('profile'); // optional — restrict to one profile
  const HR = '─'.repeat(56);

  // 1. Load profile JSONs
  const scriptDir    = dirname(fileURLToPath(import.meta.url));
  const setupsDir    = resolve(scriptDir, '../quick_setups');
  const allFiles     = readdirSync(setupsDir).filter(f => f.endsWith('.json'));
  const targetFiles  = profileArg
    ? allFiles.filter(f => f.startsWith(profileArg))
    : allFiles;

  if (targetFiles.length === 0) {
    console.error(c.red(`No profiles found${profileArg ? ` matching "${profileArg}"` : ''} in ${setupsDir}`));
    process.exit(1);
  }

  const profiles = targetFiles.map(f => ({
    file: f,
    ...JSON.parse(readFileSync(join(setupsDir, f), 'utf8')),
  }));

  console.log();
  console.log(`  ${c.bold('Quick Setup')} — ${profiles.length} profile(s), classroom: ${c.cyan(className)}`);
  console.log(`  ${HR}`);

  // 2. Get existing students from ERP
  console.log(`  ${c.dim('Loading existing students from ERP…')}`);
  let existing;
  try {
    existing = await erpGet('/students/all');
  } catch (e) {
    console.error(c.red(`  Cannot reach ERP at ${ERP}: ${e.message}`));
    process.exit(1);
  }
  const byName = new Map(existing.map(s => [s.name, s]));

  // 3. Create / recreate each student
  const students = []; // { studentId, profile }
  for (const profile of profiles) {
    process.stdout.write(`  ${c.bold(profile.name)} `);

    // Delete if exists (ERP cascades to LP via its DELETE endpoint)
    if (byName.has(profile.name)) {
      const old = byName.get(profile.name);
      try {
        await erpDel(`/students/${old.studentId}`);
        process.stdout.write(c.dim('(deleted old) '));
      } catch (e) {
        process.stdout.write(c.yellow(`(delete failed: ${e.message}) `));
      }
    }

    // Create fresh
    try {
      const created = await erpPost('/admin/students', { name: profile.name, grade: profile.grade });
      students.push({ studentId: created.studentId, code: created.code, profile });
      console.log(c.green(`✓`) + c.dim(`  id=${created.studentId}  code=${created.code}`));
    } catch (e) {
      console.log(c.red(`✗  ${e.message}`));
    }
  }

  if (students.length === 0) {
    console.error(c.red('  No students created. Aborting.'));
    process.exit(1);
  }

  // 4. Resolve classroom topics from concept CMS lookups
  console.log();
  console.log(`  ${c.dim('Resolving classroom topics from CMS…')}`);
  let classroomTopics;
  try {
    classroomTopics = await resolveClassroomTopics(profiles);
  } catch (e) {
    console.error(c.red(`  Topic resolution failed: ${e.message}`));
    classroomTopics = [];
  }
  console.log(`  ${c.dim(`Found ${classroomTopics.length} topic(s) for classroom`)}`);

  // 5. Create classroom
  console.log();
  process.stdout.write(`  Creating classroom ${c.cyan(className)} … `);
  let classroomId;
  try {
    const cls = await erpPost('/admin/classrooms', { name: className, topics: classroomTopics });
    classroomId = cls.classroomId;
    console.log(c.green('✓') + c.dim(`  id=${classroomId}  code=${cls.classCode}`));
  } catch (e) {
    console.log(c.red(`✗  ${e.message}`));
    process.exit(1);
  }

  // 6. Enroll all students and run concept setup
  console.log();
  console.log(`  ${c.bold('Setting up journeys:')}`);
  console.log(`  ${HR}`);

  for (const { studentId, profile } of students) {
    console.log();
    console.log(`  ${c.bold(profile.name)} ${c.dim(studentId)}`);

    // Enroll in classroom
    try {
      await erpPost(`/admin/classrooms/${classroomId}/enroll`, { studentId });
      console.log(`    ${c.dim('enrolled in classroom')}`);
    } catch (e) {
      console.log(`    ${c.yellow(`enrollment failed: ${e.message}`)}`);
    }

    // Setup concepts
    if (!profile.concepts || profile.concepts.length === 0) {
      console.log(`    ${c.dim('no concepts configured — student starts from scratch')}`);
      continue;
    }

    const journeyCache = { subjectByTopic: new Map(), journeyBySubject: new Map(), allJourneys: null };
    const flushSessions = profile.flushSessions ?? true;

    for (const entry of profile.concepts) {
      process.stdout.write(`    ${c.cyan(entry.concept)} @ ${entry.state} … `);
      try {
        const r = await setupOne(studentId, entry.concept, entry.state, {
          topicHint: entry.topic ?? null,
          flushSessions,
          journeyCache,
        });
        const notes = [r.nodeAction, r.sessionNote].filter(Boolean).join(', ');
        console.log(c.green('✓') + c.dim(`  ${notes}`));
      } catch (err) {
        console.log(c.red('✗') + c.dim(`  ${err.message}`));
      }
    }
  }

  // 7. Summary
  console.log();
  console.log(`  ${HR}`);
  console.log(`  ${c.bold('Done.')}  ${students.length} student(s) in classroom ${c.cyan(className)}`);
  console.log();
  console.log(`  ${c.bold('Student codes:')}`);
  for (const { studentId, code, profile } of students) {
    console.log(`    ${profile.name.padEnd(25)} code=${c.cyan(code)}  id=${c.dim(studentId)}`);
  }
  console.log();
  console.log(`  ${c.dim('Tip: paste a code into the app\'s student login to continue as that student.')}`);
  console.log();
}

main().catch(err => {
  console.error(c.red(`\n  Fatal: ${err.message}`));
  process.exit(1);
});
