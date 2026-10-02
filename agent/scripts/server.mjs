/**
 * Prodigy multi-session agent server
 *
 * Usage:
 *   node scripts/server.mjs [--port 32004]
 *
 * HTTP  GET  /health                                  → { status, sessions }
 * HTTP  POST /sessions { studentId, conceptId }       → { sessionId, concept, state, resumed }
 * WS    ws://host:PORT?sessionId=<id>                 → tutor session
 *
 * cli.mjs continues to work unchanged — it uses its own SessionManager instance.
 */

import { readFileSync } from 'fs';
import { resolve }      from 'path';

// Load .env from agent root
try {
  const env = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && !key.startsWith('#')) process.env[key.trim()] ??= rest.join('=').trim();
  }
} catch {}

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const port = parseInt(flag('--port') ?? process.env.SERVER_PORT ?? '32004', 10);

const { SessionManager }     = await import('../dist/session-manager.js');
const { MultiSessionServer } = await import('../dist/transports/ws-multi.js');
const { CanvasMedium }       = await import('../dist/medium/canvas.js');

console.log(`[TTS] ${process.env.USE_TTS_PROVIDER || 'disabled — set USE_TTS_PROVIDER=inworld for spoken audio'}`);

const sm     = new SessionManager();
const server = new MultiSessionServer({
  port,
  medium: () => CanvasMedium.create(),
});

server.start(sm);
