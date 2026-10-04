#!/usr/bin/env node
/**
 * student.mjs — dev CLI for inspecting and resetting student data
 *
 * Commands:
 *   node student.mjs list
 *   node student.mjs details --student <id>
 *   node student.mjs setup   --student <id> --concept <slug> --state <state>
 *                            [--topic <topicId>] [--flush-sessions]
 *   node student.mjs setup   --student <id> --concepts "c1:state1,c2:state2"
 *                            [--flush-sessions]
 *   node student.mjs setup   --student <id> --file setup.json
 *   node student.mjs flushAll --student <id>   LP data only
 *   node student.mjs delete --student <id>     ERP + LP
 *   node student.mjs deleteAll                 ERP + LP for every student
 *   node student.mjs flushOthers --keep <id>   LP only, keep one
 *
 * setup: plants a journey node at the given concept+state so the "Continue"
 * button on the home screen points there. Use --flush-sessions to also wipe
 * in-flight sessions for that concept (forces a fresh start instead of resume).
 *
 * Valid states: not_assessed | assessing | learning | clarity |
 *               mastering | getting_exam_ready | mastered | exam_ready
 *
 * Env:
 *   LP_URL   (default: http://localhost:32002)
 *   CMS_URL  (default: http://localhost:32001)
 *   ERP_URL  (default: http://localhost:32005)
 */

const LP  = process.env.LP_URL  ?? 'http://localhost:32002';
const CMS = process.env.CMS_URL ?? 'http://localhost:32001';
const ERP = process.env.ERP_URL ?? 'http://localhost:32005';

const args   = process.argv.slice(2);
const cmd    = args[0];
const isTTY  = process.stdout.isTTY;
const asJson = args.includes('--json');

// ── Colour helpers ────────────────────────────────────────────────────────────

const c = {
  bold:  s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:   s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
  cyan:  s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  green: s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:   s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow:s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
};

// ── CLI arg helpers ───────────────────────────────────────────────────────────

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path) {
  const r = await fetch(`${LP}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function del(path) {
  const r = await fetch(`${LP}${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(`${LP}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function patch(path, body) {
  const r = await fetch(`${LP}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function cmsGet(path) {
  const r = await fetch(`${CMS}${path}`);
  if (!r.ok) throw new Error(`GET CMS ${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function erpGet(path) {
  const r = await fetch(`${ERP}${path}`);
  if (!r.ok) throw new Error(`GET ${ERP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

async function erpDel(path) {
  const r = await fetch(`${ERP}${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${ERP}${path} → ${r.status} ${r.statusText}`);
  return r.json();
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const HR = '─'.repeat(54);

function stateColour(state) {
  if (!state) return c.dim('—');
  if (state === 'mastered' || state === 'exam_ready') return c.green(state);
  if (state === 'learning' || state === 'clarity')    return c.cyan(state);
  if (state === 'learn-pre-req-before')               return c.yellow(state);
  return c.dim(state);   // not_assessed
}

function shortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdList() {
  let students;
  try {
    students = await get('/students');
  } catch (e) {
    console.error(c.red(`Cannot reach LP at ${LP}: ${e.message}`));
    process.exit(1);
  }

  if (students.length === 0) {
    console.log(c.dim('  No students found.'));
    return;
  }

  console.log();
  console.log(`  ${c.bold('Students')} ${c.dim(`(${students.length})`)}`);
  console.log(`  ${HR}`);

  for (const s of students) {
    const id      = c.cyan(s.studentId.padEnd(30));
    const details = c.dim(
      `${plural(s.journeyCount, 'journey')}  ` +
      `${plural(s.sessionCount, 'session')}  ` +
      `${plural(s.memoryCount, 'memory')}`,
    );
    console.log(`  ${id}  ${details}`);
  }
  console.log();
}

async function cmdDetails() {
  const studentId = flag('student');
  if (!studentId) { console.error(c.red('  --student <id> required')); process.exit(1); }

  let journeys, sessions, memories;
  try {
    [journeys, sessions, memories] = await Promise.all([
      get(`/students/${studentId}/journeys`),
      get(`/students/${studentId}/sessions`),
      get(`/students/${studentId}/memories`),
    ]);
  } catch (e) {
    console.error(c.red(`Error: ${e.message}`));
    process.exit(1);
  }

  if (asJson) {
    const nodes = (await Promise.all(journeys.map(j => get(`/journeys/${j.id}/nodes`).catch(() => [])))).flat();
    console.log(JSON.stringify({ journeys, nodes, sessions, memories }, null, 2));
    return;
  }

  console.log();
  console.log(`  ${c.bold('Student:')} ${c.cyan(studentId)}`);
  console.log(`  ${HR}`);

  // Journeys + nodes
  if (journeys.length === 0) {
    console.log(`  ${c.dim('No journeys.')}`);
  } else {
    for (const journey of journeys) {
      console.log();
      console.log(`  ${c.bold('Journey')} ${c.dim(journey.id)}`);

      let nodes = [];
      try { nodes = await get(`/journeys/${journey.id}/nodes`); } catch {}

      if (nodes.length === 0) {
        console.log(`    ${c.dim('(no nodes)')}`);
      } else {
        console.log(`    Nodes (${nodes.length}):`);
        for (const n of nodes) {
          const val = v => v ? c.cyan(v) : c.dim('—');
          console.log();
          console.log(`      ${c.bold(n.conceptId)}`);
          console.log(`        state     ${stateColour(n.state)}`);
          console.log(`        goTo      ${val(n.goTo)}`);
          console.log(`        cameFrom  ${val(n.cameFrom)}`);
          console.log(`        prereq    ${n.preReqToLearn ? c.yellow(n.preReqToLearn) : c.dim('—')}`);
          console.log(`        activity  ${c.dim(shortDate(n.lastActivity))}`);
          if (n.completedAt) console.log(`        completed ${c.green(shortDate(n.completedAt))}`);
        }
      }
    }
  }

  // Sessions
  console.log();
  console.log(`  ${c.bold(`Sessions (${sessions.length}):`)} `);
  if (sessions.length === 0) {
    console.log(`    ${c.dim('(none)')}`);
  } else {
    for (const s of sessions) {
      const status  = s.status === 'completed' ? c.dim(`[${s.status}]`) : c.cyan(`[${s.status}]`);
      const turns   = c.dim(`${plural(s.history?.length ?? 0, 'turn')}`);
      const started = c.dim(shortDate(s.createdAt));
      const stateTransition = `${stateColour(s.conceptStateAtStart)} → ${stateColour(s.conceptStateAtEnd)}`;
      console.log(`    ${status}  ${stateTransition}  ${turns}  ${started}  ${c.dim(s.id)}`);
      console.log(`    ${c.dim('└─')} ${c.dim(s.conceptId)}`);
    }
  }

  // Memories
  console.log();
  console.log(`  ${c.bold(`Memories (${memories.length}):`)} `);
  if (memories.length === 0) {
    console.log(`    ${c.dim('(none)')}`);
  } else {
    for (const m of memories) {
      const tag     = `[${m.type}]`.padEnd(11);
      const tagFmt  = m.type === 'factual' ? c.cyan(tag) : c.yellow(tag);
      const preview = m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content;
      console.log(`    ${tagFmt}  ${preview}`);
    }
  }

  console.log();
}

async function cmdSessionDetails() {
  const sessionId = flag('session');
  if (!sessionId) { console.error(c.red('  --session <id> required')); process.exit(1); }

  let s;
  try {
    s = await get(`/sessions/${sessionId}`);
  } catch (e) {
    console.error(c.red(`Error: ${e.message}`));
    process.exit(1);
  }

  if (asJson) { console.log(JSON.stringify(s, null, 2)); return; }

  console.log();
  console.log(`  ${c.bold('Session:')} ${c.dim(s.id)}`);
  console.log(`  ${HR}`);
  console.log(`  student    ${c.cyan(s.studentId)}`);
  console.log(`  concept    ${c.dim(s.conceptId)}`);
  console.log(`  status     ${s.status === 'completed' ? c.dim(s.status) : c.cyan(s.status)}`);
  console.log(`  state      ${stateColour(s.conceptStateAtStart)} → ${stateColour(s.conceptStateAtEnd)}`);
  console.log(`  started    ${c.dim(shortDate(s.createdAt))}`);
  if (s.endedAt) console.log(`  ended      ${c.dim(shortDate(s.endedAt))}`);

  // Plan history
  const planHistory = s.planHistory ?? [];
  console.log();
  console.log(`  ${c.bold(`Plan history (${planHistory.length}):`)} `);
  for (const entry of planHistory) {
    const steps = entry.plan?.length ?? 0;
    console.log(`    ${c.cyan(entry.conceptId)}  ${c.dim(`${steps} steps  started ${shortDate(entry.startedAt)}`)}`);
  }

  // Teaching plan
  if (s.teachingPlan?.content) {
    console.log();
    console.log(`  ${c.bold('Teaching plan:')}`);
    console.log(`    ${c.dim(s.teachingPlan.content)}`);
  }

  // Conversation history
  const history = s.history ?? [];
  console.log();
  console.log(`  ${c.bold(`Conversation (${history.length} turns):`)} `);
  for (const turn of history) {
    const who     = turn.role === 'agent' ? c.cyan('agent  ') : c.dim('student');
    const preview = turn.content.length > 120 ? turn.content.slice(0, 120) + '…' : turn.content;
    console.log(`    ${who}  ${preview}`);
  }

  console.log();
}

// ── How "Continue" works ──────────────────────────────────────────────────────
//
// LP /home ranks in_progress topics by most recent activity (node.lastActivity
// augmented with session timestamps). For the top-ranked topic it calls
// selectNextConcept → picks the most recently active unfinished concept →
// returns { conceptId, state, resumeSessionId }.
//
// resumeSessionId is set only when the node is in a transition state
// (assessing/learning/mastering/getting_exam_ready) AND a session exists with
// status=started, journeyNodeId=node.id, conceptStateAtStart=node.state.
//
// setupOne:
//   1. Resolves concept → topic → subjectId from CMS
//   2. Finds or creates the subject journey in LP (cached across calls)
//   3. Finds or creates the journey node for the concept
//   4. Patches the node to the requested state + bumps lastActivity to now
//   5. If flushSessions: marks all started sessions completed (fresh start)

const VALID_STATES = [
  'not_assessed', 'assessing', 'learning', 'clarity',
  'mastering', 'getting_exam_ready', 'mastered', 'exam_ready',
];
const TRANSITION_STATES = new Set(['assessing', 'learning', 'mastering', 'getting_exam_ready']);

async function setupOne(studentId, conceptId, state, { topicHint, flushSessions, journeyCache }) {
  // 1. Resolve concept from CMS
  const concept = await cmsGet(`/concepts/${conceptId}`);
  const topicId = topicHint ?? concept.topic ?? null;
  if (!topicId) throw new Error(`Concept "${conceptId}" has no topic set in CMS. Pass --topic <id>.`);

  // 2. Resolve subjectId from topic (cached)
  if (!journeyCache.subjectByTopic.has(topicId)) {
    const info = await cmsGet(`/topics/${topicId}/subject`);
    journeyCache.subjectByTopic.set(topicId, info.subjectId);
  }
  const subjectId = journeyCache.subjectByTopic.get(topicId);

  // 3. Find or create the subject journey (cached)
  if (!journeyCache.journeyBySubject.has(subjectId)) {
    if (!journeyCache.allJourneys) {
      journeyCache.allJourneys = await get(`/students/${studentId}/journeys`).catch(() => []);
    }
    let journey = journeyCache.allJourneys.find(j => j.subjectId === subjectId);
    if (!journey) {
      journey = await post(`/students/${studentId}/journeys`, { objective: 'Learn subject', subjectId });
      journeyCache.allJourneys.push(journey);
    }
    journeyCache.journeyBySubject.set(subjectId, journey);
  }
  const journey = journeyCache.journeyBySubject.get(subjectId);

  // 4. Find or create the journey node
  const existingNodes = await get(`/journey-nodes?journeyId=${journey.id}&conceptId=${conceptId}`).catch(() => []);
  let node = existingNodes[0];
  let nodeAction;
  if (!node) {
    const goTo = concept.nextConcepts?.[0] ?? null;
    node = await post('/journey-nodes', {
      journeyId: journey.id, conceptId,
      order: 1, state, masteryLevel: null,
      goTo, cameFrom: null, preReqToLearn: null,
      topicId, lastActivity: new Date().toISOString(),
    });
    nodeAction = 'created';
  } else {
    await patch(`/journey-nodes/${node.id}`, { state, lastActivity: new Date().toISOString() });
    node.state = state;
    nodeAction = 'patched';
  }

  // 5. Handle sessions
  let sessionNote;
  if (flushSessions) {
    const sessions = await get(`/students/${studentId}/sessions?conceptId=${encodeURIComponent(conceptId)}&status=started`).catch(() => []);
    for (const s of sessions) {
      await patch(`/sessions/${s.id}`, { status: 'completed', endedAt: new Date().toISOString() }).catch(() => {});
    }
    sessionNote = sessions.length > 0 ? `flushed ${sessions.length} session(s)` : 'none to flush';
  } else if (TRANSITION_STATES.has(state)) {
    const sessions = await get(`/students/${studentId}/sessions?conceptId=${encodeURIComponent(conceptId)}&status=started`).catch(() => []);
    const resumable = sessions.find(s => s.journeyNodeId === node.id && s.conceptStateAtStart === state);
    sessionNote = resumable ? `will resume session ${resumable.id}` : 'fresh start';
  }

  return { concept, topicId, subjectId, journey, node, nodeAction, sessionNote };
}

async function cmdSetup() {
  const studentId     = flag('student');
  const flushSessions = args.includes('--flush-sessions');
  const filePath      = flag('file');
  const conceptsArg   = flag('concepts');   // "concept1:state1,concept2:state2"
  const singleConcept = flag('concept');
  const singleState   = flag('state');
  const topicHint     = flag('topic');

  if (!studentId) {
    console.error(c.red('  --student <id> required'));
    process.exit(1);
  }

  // Build the list of { conceptId, state } entries to process
  let entries = [];

  if (filePath) {
    const { readFileSync } = await import('fs');
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    // Support { concepts: [{concept, state}] } or [{concept, state}]
    const list = Array.isArray(raw) ? raw : raw.concepts ?? [];
    entries = list.map(e => ({ conceptId: e.concept, state: e.state, topicHint: e.topic ?? null, flushSessions: e.flushSessions ?? flushSessions }));
  } else if (conceptsArg) {
    // "concept1:state1,concept2:state2"
    entries = conceptsArg.split(',').map(part => {
      const colon = part.lastIndexOf(':');
      if (colon === -1) throw new Error(`Invalid --concepts entry "${part}" — expected concept:state`);
      return { conceptId: part.slice(0, colon), state: part.slice(colon + 1), topicHint: null, flushSessions };
    });
  } else if (singleConcept && singleState) {
    entries = [{ conceptId: singleConcept, state: singleState, topicHint, flushSessions }];
  } else {
    console.error(c.red('  Provide --concept + --state, --concepts "c1:s1,c2:s2", or --file setup.json'));
    process.exit(1);
  }

  // Validate states up front
  for (const e of entries) {
    if (!VALID_STATES.includes(e.state)) {
      console.error(c.red(`  Invalid state "${e.state}" for concept "${e.conceptId}". Valid: ${VALID_STATES.join(' | ')}`));
      process.exit(1);
    }
  }

  console.log();
  console.log(`  Setting up ${c.cyan(studentId)} — ${entries.length} concept(s)`);
  console.log(`  ${HR}`);

  // Shared cache so multiple concepts in the same subject reuse the journey lookup
  const journeyCache = { subjectByTopic: new Map(), journeyBySubject: new Map(), allJourneys: null };

  let continueCandidate = null; // last non-terminal entry — shown in Continue hint
  for (const e of entries) {
    process.stdout.write(`  ${c.bold(e.conceptId)} @ ${stateColour(e.state)} … `);
    try {
      const r = await setupOne(studentId, e.conceptId, e.state, {
        topicHint:     e.topicHint,
        flushSessions: e.flushSessions,
        journeyCache,
      });
      const notes = [r.nodeAction, r.sessionNote].filter(Boolean).join(', ');
      console.log(c.green('✓') + c.dim(`  ${notes}`));
      if (TRANSITION_STATES.has(e.state)) continueCandidate = e;
    } catch (err) {
      console.log(c.red('✗') + c.dim(`  ${err.message}`));
    }
  }

  console.log();
  if (continueCandidate) {
    console.log(`  ${c.bold('Continue')} will land on: ${c.bold(continueCandidate.conceptId)} @ ${stateColour(continueCandidate.state)}`);
    console.log(c.dim('  (most recently touched transition-state concept)'));
  }
  console.log();
}

async function cmdFlushAll() {
  const studentId = flag('student');
  if (!studentId) { console.error(c.red('  --student <id> required')); process.exit(1); }

  console.log();
  console.log(`  Flushing all data for ${c.cyan(studentId)}...`);

  let result;
  try {
    result = await del(`/students/${studentId}/all`);
  } catch (e) {
    console.error(c.red(`  Error: ${e.message}`));
    process.exit(1);
  }

  const d = result.deleted;
  console.log(
    `  ${c.green('Deleted:')}  ` +
    `${plural(d.journeys, 'journey')}  ` +
    `${plural(d.nodes, 'node')}  ` +
    `${plural(d.sessions, 'session')}  ` +
    `${plural(d.memories, 'memory')}`,
  );
  console.log(`  ${c.green('Done.')}`);
  console.log();
}

async function cmdFlushOthers() {
  const keepId = flag('keep');
  if (!keepId) { console.error(c.red('  --keep <id> required')); process.exit(1); }

  let students;
  try {
    students = await get('/students');
  } catch (e) {
    console.error(c.red(`Cannot reach LP at ${LP}: ${e.message}`));
    process.exit(1);
  }

  const targets = students.filter(s => s.studentId !== keepId);
  if (targets.length === 0) {
    console.log(`\n  ${c.dim('No other students to delete.')}\n`);
    return;
  }

  console.log();
  console.log(`  Keeping: ${c.cyan(keepId)}`);
  console.log(`  Deleting ${targets.length} other student(s):`);
  for (const s of targets) console.log(`    ${c.dim(s.studentId)}`);
  console.log();

  let total = { journeys: 0, nodes: 0, journeyTopics: 0, sessions: 0, memories: 0 };
  for (const s of targets) {
    try {
      const result = await del(`/students/${s.studentId}/all`);
      const d = result.deleted;
      total.journeys      += d.journeys      ?? 0;
      total.nodes         += d.nodes         ?? 0;
      total.journeyTopics += d.journeyTopics ?? 0;
      total.sessions      += d.sessions      ?? 0;
      total.memories      += d.memories      ?? 0;
      console.log(`  ${c.green('✓')} ${s.studentId}`);
    } catch (e) {
      console.error(`  ${c.red('✗')} ${s.studentId}  ${c.dim(e.message)}`);
    }
  }

  console.log();
  console.log(
    `  ${c.green('Total deleted:')}  ` +
    `${plural(total.journeys, 'journey')}  ` +
    `${plural(total.nodes, 'node')}  ` +
    `${plural(total.sessions, 'session')}  ` +
    `${plural(total.memories, 'memory')}`,
  );
  console.log();
}

/** Delete one student from ERP + LP via ERP's DELETE /students/:id */
async function cmdDelete() {
  const studentId = flag('student');
  if (!studentId) { console.error(c.red('  --student <id> required')); process.exit(1); }

  console.log();
  console.log(`  Deleting student ${c.cyan(studentId)} from ERP + LP...`);

  let result;
  try {
    result = await erpDel(`/students/${studentId}`);
  } catch (e) {
    console.error(c.red(`  Error: ${e.message}`));
    process.exit(1);
  }

  const d = result.deleted;
  console.log(`  ${c.green('ERP:')}  enrollments=${d.enrollments}  assignments=${d.assignments}  personalClassrooms=${d.personalClassrooms}`);
  if (d.lp) {
    const lp = d.lp;
    console.log(`  ${c.green('LP:')}   journeys=${lp.journeys}  nodes=${lp.nodes}  sessions=${lp.sessions}  memories=${lp.memories}`);
  }
  console.log(`  ${c.green('Done.')}`);
  console.log();
}

/** Delete every student from ERP + LP */
async function cmdDeleteAll() {
  // Fetch student list from ERP admin endpoint (all students, no auth needed).
  // Also merge any LP-only students (exist in LP but not ERP).
  let erpStudents = [], lpStudents = [];
  try { erpStudents = await erpGet('/students/all'); } catch (e) {
    console.error(c.red(`Cannot reach ERP at ${ERP}: ${e.message}`)); process.exit(1);
  }
  try { lpStudents = await get('/students'); } catch {}

  const seen = new Set(erpStudents.map(s => s.studentId));
  const lpOnly = lpStudents.filter(s => !seen.has(s.studentId));
  const students = [...erpStudents, ...lpOnly];

  if (students.length === 0) {
    console.log(`\n  ${c.dim('No students found.')}\n`);
    return;
  }

  console.log();
  console.log(`  Deleting ${c.bold(String(students.length))} student(s) from ERP + LP:`);
  for (const s of students) console.log(`    ${c.dim(s.studentId)}`);
  console.log();

  let erp = { enrollments: 0, assignments: 0, personalClassrooms: 0 };
  let lp  = { journeys: 0, nodes: 0, journeyTopics: 0, sessions: 0, memories: 0 };

  for (const s of students) {
    try {
      let erpR, lpR;
      // Try ERP delete (covers ERP + LP). If student not in ERP, fall back to LP flush.
      const erpRes = await fetch(`${ERP}/students/${s.studentId}`, { method: 'DELETE' });
      if (erpRes.ok) {
        const d = (await erpRes.json()).deleted;
        erp.enrollments        += d.enrollments        ?? 0;
        erp.assignments        += d.assignments        ?? 0;
        erp.personalClassrooms += d.personalClassrooms ?? 0;
        if (d.lp) {
          lp.journeys      += d.lp.journeys      ?? 0;
          lp.nodes         += d.lp.nodes         ?? 0;
          lp.journeyTopics += d.lp.journeyTopics ?? 0;
          lp.sessions      += d.lp.sessions      ?? 0;
          lp.memories      += d.lp.memories      ?? 0;
        }
      } else if (erpRes.status === 404) {
        // LP-only student — flush LP directly
        const lpRes = await fetch(`${LP}/students/${s.studentId}/all`, { method: 'DELETE' });
        if (lpRes.ok) {
          const d = (await lpRes.json()).deleted;
          lp.journeys      += d.journeys      ?? 0;
          lp.nodes         += d.nodes         ?? 0;
          lp.journeyTopics += d.journeyTopics ?? 0;
          lp.sessions      += d.sessions      ?? 0;
          lp.memories      += d.memories      ?? 0;
        }
      } else {
        throw new Error(`ERP ${erpRes.status} ${erpRes.statusText}`);
      }
      console.log(`  ${c.green('✓')} ${s.studentId}`);
    } catch (e) {
      console.error(`  ${c.red('✗')} ${s.studentId}  ${c.dim(e.message)}`);
    }
  }

  console.log();
  console.log(`  ${c.green('ERP total:')}  enrollments=${erp.enrollments}  assignments=${erp.assignments}  personalClassrooms=${erp.personalClassrooms}`);
  console.log(`  ${c.green('LP total:')}   journeys=${lp.journeys}  nodes=${lp.nodes}  sessions=${lp.sessions}  memories=${lp.memories}`);
  console.log();
}

function usage() {
  console.log(`
  Usage:
    node student.mjs list
    node student.mjs details         --student <id>
    node student.mjs session-details --session <id>
    node student.mjs setup           --student <id> --concept <slug> --state <state>
                                     [--topic <topicId>] [--flush-sessions]
    node student.mjs setup           --student <id> --concepts "c1:s1,c2:s2" [--flush-sessions]
    node student.mjs setup           --student <id> --file setup.json
    node student.mjs flushAll        --student <id>   (LP only)
    node student.mjs flushOthers     --keep <id>      (LP only)
    node student.mjs delete          --student <id>   (ERP + LP)
    node student.mjs deleteAll                        (ERP + LP, all students)

  setup states: not_assessed | assessing | learning | clarity |
                mastering | getting_exam_ready | mastered | exam_ready

  Env:
    LP_URL   (default: http://localhost:32002)
    CMS_URL  (default: http://localhost:32001)
    ERP_URL  (default: http://localhost:32005)
  `);
  process.exit(0);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

try {
  switch (cmd) {
    case 'list':            await cmdList();            break;
    case 'details':         await cmdDetails();         break;
    case 'session-details': await cmdSessionDetails();  break;
    case 'setup':           await cmdSetup();           break;
    case 'flushAll':        await cmdFlushAll();        break;
    case 'flushOthers':     await cmdFlushOthers();     break;
    case 'delete':          await cmdDelete();          break;
    case 'deleteAll':       await cmdDeleteAll();       break;
    default:                usage();
  }
} catch (e) {
  console.error(c.red(`  Error: ${e.message}`));
  process.exit(1);
}
