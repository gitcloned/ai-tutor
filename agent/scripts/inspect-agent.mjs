/**
 * inspect-agent.mjs
 *
 * Prints exactly what the agent would receive — system prompt and tool definitions —
 * for a given concept and state. No LLM call made.
 *
 * Usage:
 *   node scripts/inspect-agent.mjs [--concept <kaSlug>] [--cms <url>]
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const args   = process.argv.slice(2);
const flag   = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const kaSlug = flag('--concept') || 'plugging_in_values';
const cmsUrl = flag('--cms')     || 'http://localhost:32001';
const lpUrl  = flag('--lp')      || 'http://localhost:32002';

process.env['CMS_URL'] = cmsUrl;
process.env['LP_URL']  = lpUrl;

const get  = url  => fetch(url).then(r => { if (!r.ok) throw new Error(`GET ${url} → ${r.status}`); return r.json(); });
const post = (url, body) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(r => { if (!r.ok) throw new Error(`POST ${url} → ${r.status}`); return r.json(); });

// ── Load concept ───────────────────────────────────────────────────────────────
const [concept] = await get(`${cmsUrl}/concepts?kaSlug=${kaSlug}`);
if (!concept) { console.error(`Concept not found: kaSlug=${kaSlug}`); process.exit(1); }

// ── Upsert mock journey node (not_assessed) ────────────────────────────────────
const existing = await get(`${lpUrl}/journey-nodes?journeyId=000000000000000000000001&conceptId=${concept.id}`).catch(() => []);
const node = existing.length > 0
  ? existing[0]
  : await post(`${lpUrl}/journey-nodes`, {
      journeyId: '000000000000000000000001',
      conceptId: concept.id,
      order: 1, state: 'not_assessed', masteryLevel: null, probingPath: [],
    });
const studentId = '000000000000000000000002';

// ── Build context via agent modules ───────────────────────────────────────────
const { buildContext } = await import('../dist/context.js');
const ctx = await buildContext(studentId, concept.id, node.id);

// ── Load base prompt + skill ───────────────────────────────────────────────────
const basePrompt = readFileSync(join(__dir, '../prompts/base.md'), 'utf8');

// Inline skill loader (mirrors src/skills.ts)
function loadSkill(skillsDir, state) {
  for (const folder of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    try {
      const raw   = readFileSync(join(skillsDir, folder.name, 'SKILL.md'), 'utf8');
      const match = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
      if (!match) continue;
      const meta  = Object.fromEntries(
        match[1].split('\n').map(l => l.split(':').map(s => s.trim()))
          .filter(p => p.length >= 2).map(([k, ...v]) => [k, v.join(':').trim()])
      );
      if (meta.state !== state) continue;
      return {
        tools: (meta.tools ?? '').split(',').map(s => s.trim()).filter(Boolean),
        body:  match[2].trim(),
      };
    } catch { continue; }
  }
  return null;
}

const skill = loadSkill(join(__dir, '../skills'), ctx.journeyNode.state);
if (!skill) { console.error(`No skill for state: ${ctx.journeyNode.state}`); process.exit(1); }

// ── Render skill prompt ────────────────────────────────────────────────────────
const planLines = ctx.plan.map(s => `[${s.status}] ${s.id}. ${s.content}`).join('\n');
const memLines  = ctx.memories.length > 0
  ? ctx.memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
  : 'None yet.';

const skillPrompt = skill.body
  .replace('{{concept.title}}', ctx.concept.title)
  .replace('{{probingTree}}',   JSON.stringify(ctx.concept.probingTree ?? {}, null, 2))
  .replace('{{plan}}',          planLines)
  .replace('{{memories}}',      memLines);

const systemPrompt = `${basePrompt}\n\n---\n\n${skillPrompt}`;

// ── Load tool definitions ──────────────────────────────────────────────────────
const { read_plan, get_next_step, update_step } = await import('../dist/tools/plan.js');
const { advance_state }  = await import('../dist/tools/state.js');
const { store_memory }   = await import('../dist/tools/memory.js');

const allTools = { read_plan, get_next_step, update_step, advance_state, store_memory };
const activeTools = skill.tools.map(name => {
  const t = allTools[name];
  if (!t) throw new Error(`Unknown tool: ${name}`);
  return t;
});

// ── Print ──────────────────────────────────────────────────────────────────────
const hr = '─'.repeat(70);

console.log(`\n${hr}`);
console.log(`CONCEPT   : ${concept.title}  (${kaSlug})`);
console.log(`STATE     : ${ctx.journeyNode.state}`);
console.log(`PLAN STEPS: ${ctx.plan.length}`);
console.log(`MEMORIES  : ${ctx.memories.length}`);
console.log(`TOOLS     : ${skill.tools.join(', ')}`);
console.log(hr);

console.log('\n── SYSTEM PROMPT ──────────────────────────────────────────────────────\n');
console.log(systemPrompt);

console.log('\n── TOOLS ──────────────────────────────────────────────────────────────\n');
for (const tool of activeTools) {
  console.log(`▸ ${tool.name}`);
  console.log(`  ${tool.description}`);
  console.log(`  schema: ${JSON.stringify(tool.schema)}\n`);
}

console.log(hr + '\n');
