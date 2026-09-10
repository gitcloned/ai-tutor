#!/usr/bin/env node
/**
 * student.mjs — dev CLI for inspecting and resetting student data
 *
 * Commands:
 *   node student.mjs list
 *   node student.mjs details --student <id>
 *   node student.mjs flushAll --student <id>
 *
 * Env:
 *   LP_URL   (default: http://localhost:3002)
 *   CMS_URL  (default: http://localhost:3001)
 */

const LP  = process.env.LP_URL  ?? 'http://localhost:3002';

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

function usage() {
  console.log(`
  Usage:
    node student.mjs list
    node student.mjs details         --student <id>
    node student.mjs session-details --session <id>
    node student.mjs flushAll        --student <id>

  Env:
    LP_URL   (default: http://localhost:3002)
    CMS_URL  (default: http://localhost:3001)
  `);
  process.exit(0);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

try {
  switch (cmd) {
    case 'list':           await cmdList();           break;
    case 'details':        await cmdDetails();        break;
    case 'session-details': await cmdSessionDetails(); break;
    case 'flushAll':       await cmdFlushAll();       break;
    default:               usage();
  }
} catch (e) {
  console.error(c.red(`  Error: ${e.message}`));
  process.exit(1);
}
