/**
 * Preview the compiled plan for a concept's probe.md.
 *
 * Usage:
 *   node scripts/preview-plan.mjs graphing-solutions-to-2-variable-linear-equations-1
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';

const __dir    = dirname(fileURLToPath(import.meta.url));
const conceptId = process.argv[2];

if (!conceptId) {
  console.error('Usage: node scripts/preview-plan.mjs <conceptId>');
  process.exit(1);
}

// Inline the parser so this script has zero build deps

const KV_RE = /^(redirect|mode|reason):\s*(.+)$/i;

function parseStep(id, name, body) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const kv    = {};
  const prose = [];

  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const m = KV_RE.exec(line);
    if (m) kv[m[1].toLowerCase()] = m[2].trim();
    else   prose.push(line);
  }

  if (kv['redirect']) {
    const content = {};
    if (name) content.name = name;
    content.conceptId    = kv['redirect'];
    content.conceptTitle = kv['redirect'];
    content.mode         = kv['mode'] ?? 'teach';
    if (kv['reason']) content.reason = kv['reason'];
    if (prose.length)  content.instruction = prose.join('\n');
    return { id, type: 'teach', content, ifCorrect: null, ifWrong: null };
  }

  const content = {};
  if (name) content.name = name;
  content.instruction = prose.join('\n');
  return { id, type: 'step', content, ifCorrect: null, ifWrong: null };
}

const HEADER_RE       = /^## (?:Step )?(\d+)(?:\s+\(([^)]+)\))?\s*$/gm;
const HEADER_SPLIT_RE = /^## (?:Step )?\d+(?:\s+\([^)]+\))?\s*$/m;

function buildPlanFromMarkdown(markdown) {
  const headers = [...markdown.matchAll(HEADER_RE)];
  if (!headers.length) return [];
  const parts = markdown.split(HEADER_SPLIT_RE);
  const raw   = headers.map((h, i) => parseStep(parseInt(h[1], 10), h[2]?.trim() ?? null, parts[i + 1] ?? ''));

  const lastId    = raw.at(-1)?.id ?? 0;
  const storeId   = lastId + 1;
  const advanceId = lastId + 2;

  raw.push(
    { id: storeId,   type: 'store_memory', content: { instruction: 'Store what you learned about this student' }, ifCorrect: advanceId, ifWrong: advanceId },
    { id: advanceId, type: 'advance_state', content: { instruction: 'Advance state to "learning"', targetState: 'learning' }, ifCorrect: null, ifWrong: null },
  );

  const resolve = (nav, isAdvance) => {
    if (isAdvance) return null;
    if (nav === 'done' || nav === null) return storeId;
    return nav;
  };

  return raw.map((r, idx) => ({
    id:        r.id,
    type:      r.type,
    content:   r.content,
    status:    idx === 0 ? 'in_progress' : 'pending',
    ifCorrect: resolve(r.ifCorrect, r.id === advanceId),
    ifWrong:   resolve(r.ifWrong,   r.id === advanceId),
  }));
}

// ── Run ───────────────────────────────────────────────────────────────────────

const contentRoot = join(__dir, '../../cms/content');
const probePath   = join(contentRoot, conceptId, 'probe.md');

if (!existsSync(probePath)) {
  console.error(`No probe.md found at: ${probePath}`);
  process.exit(1);
}

const md   = readFileSync(probePath, 'utf8');
const plan = buildPlanFromMarkdown(md);

console.log(`\nPlan for: ${conceptId}`);
console.log(`Steps: ${plan.length}\n`);

const NAV_NONE = '—';
for (const s of plan) {
  const correct = s.ifCorrect != null ? `→ ${s.ifCorrect}` : NAV_NONE;
  const wrong   = s.ifWrong   != null ? `→ ${s.ifWrong}`   : NAV_NONE;
  const name    = s.content.name ? ` (${s.content.name})` : '';
  const label   = `[${String(s.id).padStart(2)}] ${s.type.padEnd(14)} pass:${correct.padEnd(5)}  fail:${wrong.padEnd(5)}`;
  const snippet = s.type === 'teach' && s.content.conceptId
    ? `→ ${s.content.conceptId} [${s.content.mode ?? 'teach'}]`
    : String(s.content.instruction ?? '').split('\n')[0].slice(0, 60);
  console.log(`${label}  ${name ? name.padEnd(30) : ''}${snippet}`);
}
console.log();
