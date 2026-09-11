/**
 * Prodigy agent CLI
 *
 * Usage:
 *   node scripts/cli.mjs --concept <kaSlug> [--student <id>] [--log-level debug|info|warn|error|none] [--hide-tool-calls] [--output default|canvas]
 *
 * Prerequisites:
 *   pnpm build
 *   CMS + LP services running
 *   GEMINI_API_KEY in .env
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from agent root automatically
try {
  const env = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && !key.startsWith('#')) process.env[key.trim()] = rest.join('=').trim();
  }
} catch {}

const args          = process.argv.slice(2);
const flag          = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const hasFlag       = n => args.includes(n);
const conceptId     = flag('--concept');
const studentId     = flag('--student')    ?? 'test-student-1';
const logLevel      = flag('--log-level')  ?? 'debug';
const hideToolCalls = hasFlag('--hide-tool-calls');
const outputMode    = flag('--output')     ?? 'default';
const transportMode = flag('--transport')  ?? 'stdin';
const wsPort        = parseInt(flag('--port') ?? '8080', 10);

if (!conceptId) {
  console.error('Usage: node scripts/cli.mjs --concept <kaSlug> [--student <id>] [--transport stdin|ws] [--port 8080]');
  process.exit(1);
}

const { SessionManager }      = await import('../dist/session-manager.js');
const { StdinTransport }      = await import('../dist/transports/stdin.js');
const { WebSocketTransport }  = await import('../dist/transports/ws.js');
const { Canvas }              = await import('../dist/output/canvas.js');

const sm = new SessionManager();

// ── Create or resume session ──────────────────────────────────────────────────

const { sessionId, resumed } = await sm.create(studentId, conceptId);
const agent = sm.getAgent(sessionId);

const conceptTitle = agent?.ctx?.concept?.title ?? conceptId;
const state        = agent?.ctx?.journeyNode?.state ?? '—';

console.log('\n' + '─'.repeat(55));
console.log(`Session   : ${sessionId} (${resumed ? 'resumed' : 'new'})`);
console.log(`Student   : ${studentId}`);
console.log(`Concept   : ${conceptTitle}`);
console.log(`State     : ${state}`);
console.log('─'.repeat(55));
console.log('Type your message and press Enter. Type /exit to quit.\n');

// ── Join with selected transport ──────────────────────────────────────────────

const output = outputMode === 'canvas' ? Canvas.create() : undefined;

let transport;
if (transportMode === 'ws') {
  const { createRequire } = await import('module');
  const { resolve }       = await import('path');
  const __dirname         = new URL('.', import.meta.url).pathname;
  const serveHtml         = resolve(__dirname, '../src/transports/test-ws.html');
  transport = new WebSocketTransport({ port: wsPort, logLevel, output, serveHtml });
} else {
  transport = new StdinTransport({ studentName: studentId, logLevel, hideToolCalls, output });
}

await sm.join(sessionId, transport);
transport.start();

// ── Wait for session to end ───────────────────────────────────────────────────

await new Promise(resolve => {
  // StdinTransport fires disconnected on /exit — SessionManager.end() is called
  // We just need to wait for the process to be ready to exit
  const check = setInterval(async () => {
    if (!sm.isActive(sessionId)) {
      clearInterval(check);
      console.log('\n' + '─'.repeat(55));
      console.log('Session ended. History saved.');
      console.log('─'.repeat(55) + '\n');
      resolve(undefined);
    }
  }, 200);
});
