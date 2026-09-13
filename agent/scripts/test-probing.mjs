/**
 * CLI REPL — test the probing skill end-to-end.
 *
 * Prerequisites:
 *   - CMS running:  cd cms && pnpm dev
 *   - Agent built:  cd agent && npm run build
 *   - ANTHROPIC_API_KEY set
 *   - Concept in MongoDB has a probingTree (use --concept <kaSlug>)
 *
 * Usage:
 *   node scripts/test-probing.mjs [--concept <kaSlug>] [--cms <url>]
 */

import * as readline from 'readline';

const args   = process.argv.slice(2);
const flag   = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const kaSlug = flag('--concept') || 'plugging_in_values';
const cmsUrl = flag('--cms')     || 'http://localhost:32001';

process.env['CMS_URL'] = cmsUrl;

const get  = url  => fetch(url).then(r => { if (!r.ok) throw new Error(`GET ${url} → ${r.status}`); return r.json(); });
const post = (url, body) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then(r => { if (!r.ok) throw new Error(`POST ${url} → ${r.status}`); return r.json(); });

// load concept
const [concept] = await get(`${cmsUrl}/concepts?kaSlug=${kaSlug}`);
if (!concept) { console.error(`Concept not found: kaSlug=${kaSlug}`); process.exit(1); }

console.log(`\nConcept : ${concept.title}`);
if (!concept.probingTree) console.warn('⚠  No probingTree on this concept — add one in MongoDB for a proper test.\n');

// mock student + journey node
const node = await post(`${cmsUrl}/journey-nodes`, {
  journeyId: '000000000000000000000001',
  conceptId: concept._id,
  order: 1, state: 'not_assessed', masteryLevel: null, probingPath: [],
});
const studentId = '000000000000000000000002';

console.log(`Node    : ${node._id}  state: ${node.state}`);
console.log('─'.repeat(60) + '\n');

const { newAgent } = await import('../dist/agent.js');
const agent = await newAgent(studentId, concept._id, node._id);

// print the generated plan
console.log('Teaching plan:\n' + agent.ctx.plan.map(s => `  [${s.status}] ${s.id}. ${s.content}`).join('\n') + '\n');
console.log('─'.repeat(60) + '\n');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = p => new Promise(res => rl.question(p, res));

// agent opens
for await (const event of agent.initiate()) {
  if (event.type === 'text')        process.stdout.write(`Tutor: ${event.content}\n\n`);
  if (event.type === 'tool_call')   console.log(`  → [${event.name}]`);
}

// REPL
while (true) {
  const input = (await ask('You: ')).trim();
  if (!input || input === '/exit') break;

  for await (const event of agent.send(input)) {
    if (event.type === 'text')        process.stdout.write(`\nTutor: ${event.content}\n\n`);
    if (event.type === 'tool_call')   console.log(`  → [${event.name}] ${JSON.stringify(event.args)}`);
  }

  console.log(`[state: ${agent.ctx.journeyNode.state}]`);
}

rl.close();
