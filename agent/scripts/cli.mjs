/**
 * Prodigy agent CLI
 *
 * Usage:
 *   node scripts/cli.mjs --concept <kaSlug> [--medium stdin|canvas] [--student <id>]
 *                        [--log-level debug|info|warn|error|none] [--hide-tool-calls]
 *                        [--port 32004] [--tts inworld|test|none]
 *
 * --medium stdin   (default) terminal REPL — StdinMedium + StdinTransport
 * --medium canvas            browser canvas — CanvasMedium + WebSocketTransport + HTML test page
 *
 * Prerequisites:
 *   pnpm build
 *   CMS + LP services running
 *   GEMINI_API_KEY in .env
 */

import { readFileSync } from 'fs';
import { resolve }      from 'path';

// Load .env from agent root automatically
try {
  const env = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && !key.startsWith('#')) process.env[key.trim()] ??= rest.join('=').trim();
  }
} catch {}

const args          = process.argv.slice(2);
const flag          = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const hasFlag       = n => args.includes(n);
const conceptId     = flag('--concept');
const studentId     = flag('--student')    ?? 'test-student-1';
const logLevel      = flag('--log-level')  ?? 'debug';
const hideToolCalls = hasFlag('--hide-tool-calls');
const mediumName    = flag('--medium')     ?? 'stdin';
const wsPort        = parseInt(flag('--port') ?? process.env.WS_PORT ?? '32004', 10);
const ttsFlag       = flag('--tts');

// Set TTS provider before any modules load (Speak modality reads env in constructor).
if (ttsFlag === 'none') {
  delete process.env.USE_TTS_PROVIDER;
} else if (ttsFlag) {
  process.env.USE_TTS_PROVIDER = ttsFlag;
}

if (!conceptId) {
  console.error('Usage: node scripts/cli.mjs --concept <kaSlug> [--medium stdin|canvas] [--student <id>] [--port 32004] [--tts inworld|test|none]');
  process.exit(1);
}

const { SessionManager } = await import('../dist/session-manager.js');
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
console.log(`Medium    : ${mediumName}`);
console.log('─'.repeat(55));

// ── Build medium + transport from --medium flag ───────────────────────────────

let medium, transport;

if (mediumName === 'canvas') {
  const { CanvasMedium }       = await import('../dist/medium/canvas.js');
  const { WebSocketTransport } = await import('../dist/transports/ws.js');
  const __dirname = new URL('.', import.meta.url).pathname;
  const serveHtml = resolve(__dirname, '../src/transports/test-ws.html');
  medium    = CanvasMedium.create();
  transport = new WebSocketTransport({ port: wsPort, logLevel, medium, serveHtml });
  console.log('Open http://localhost:' + wsPort + ' in your browser.\n');
} else {
  // stdin (default)
  const { StdinMedium }   = await import('../dist/medium/stdin.js');
  const { StdinTransport } = await import('../dist/transports/stdin.js');
  medium    = new StdinMedium();
  transport = new StdinTransport({ studentName: studentId, logLevel, hideToolCalls, medium });
  console.log('Type your message and press Enter. Type /exit to quit.\n');
}

// ── Start ─────────────────────────────────────────────────────────────────────

await sm.join(sessionId, transport);
transport.start();

await new Promise(resolve => {
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
