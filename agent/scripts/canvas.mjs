/**
 * canvas.mjs — Replay canvas parser scenarios over WebSocket for visual testing.
 *
 * Streams ALGEBRA_RESPONSE or HEART_RESPONSE through the real Canvas parser,
 * sending each emitted event as JSON to the browser test page.
 *
 * Usage:
 *   node scripts/canvas.mjs [--scenario algebra|heart|cuboid-volume|both] [--delay <ms>] [--port <port>]
 *
 * Then open http://localhost:<port> in your browser and watch.
 *
 * Options:
 *   --scenario  text | algebra | question-algebra | heart | cuboid-volume | function-graph | function-graph-plot | both
 *   --delay     ms per character                (default: 10, use 0 for instant)
 *   --port      port number                     (default: 32004)
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { cuboidLesson } from './cuboid-lesson.mjs';
import { questionLesson } from './question-lesson.mjs';
import { functionGraphLesson, functionGraphExploreLesson } from './function-graph-lesson.mjs';

// Auto-load .env from agent root (same as cli.mjs)
try {
  const env = readFileSync(resolve(new URL('.', import.meta.url).pathname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && !key.startsWith('#')) process.env[key.trim()] ??= rest.join('=').trim();
  }
} catch { }

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const scenario = flag('--scenario') ?? 'both';
const charDelay = parseInt(flag('--delay') ?? '10', 10);
const port = parseInt(flag('--port') ?? process.env.WS_PORT ?? '32004', 10);
const ttsFlag = flag('--tts'); // inworld | test | (unset = auto-detect)

// Resolve TTS provider: explicit --tts wins; otherwise auto-detect from env.
if (ttsFlag) {
  process.env.USE_TTS_PROVIDER = ttsFlag;
} else if (!process.env.USE_TTS_PROVIDER) {
  // Auto-detect: use inworld if keys present, else fall back to visual test TTS.
  process.env.USE_TTS_PROVIDER =
    (process.env.INWORLD_API_KEY && process.env.INWORLD_VOICE_ID) ? 'inworld' : 'test';
}
const activeTTS = process.env.USE_TTS_PROVIDER;

const __dir = new URL('.', import.meta.url).pathname;
const htmlPath = resolve(__dir, '../src/transports/test-ws.html');

const { CanvasMedium } = await import('../dist/medium/canvas.js');
const { OutputParser } = await import('../dist/medium/modalities/output/parser.js');

// ── Text scenario ─────────────────────────────────────────────────────────────
// Plain streaming text — no canvas parser, no modalities.
// text_chunk events pass straight through DefaultOutput so you can verify
// the drain queue and browser streaming are actually working before testing
// the full canvas pipeline.

const TEXT_SCENARIO = {
  label: 'Streaming text — baseline check',
  text: `Let's start with something simple. This is plain streaming text — no canvas, no modalities, just characters arriving one by one and appearing on screen as they come in.

Each character is a separate WebSocket message. The browser drain queue processes one per frame, which is what makes the typewriter effect possible. If you can read this appearing letter by letter, the streaming pipeline is working correctly end to end.

Once you've confirmed this, send any message to replay — or switch to the algebra or heart scenario to see the full canvas output in action.`,
};

// ── Canvas scenarios ───────────────────────────────────────────────────────────
// Identical to canvas-parser.test.ts so we're testing the exact same input.

const SCENARIOS = {
  algebra: {
    label: 'Algebra — solving 2x + 3 = 7',
    response: `\
speak: Great, let's solve this equation together. Take a close look at what's written.
write: 2x + 3 = 7
/position: 300,80
speak: Our goal is to get x by itself. The first thing we do is get rid of that plus 3. We do this by subtracting 3 from both sides.
write: 2x + 3 - 3 = 7 - 3
write: 2x = 4
speak: Now we have 2 times x equals 4. To find x, we divide both sides by 2.
write: x = 2
/size: large
speak: Let's see where x equals 2 sits on a number line.
draw:
<svg viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">
  <line x1="20" y1="40" x2="380" y2="40" stroke="#333" stroke-width="2"/>
  <line x1="20" y1="30" x2="20" y2="50" stroke="#333" stroke-width="2"/>
  <line x1="380" y1="30" x2="380" y2="50" stroke="#333" stroke-width="2"/>
  <line x1="200" y1="30" x2="200" y2="50" stroke="#333" stroke-width="2"/>
  <text x="196" y="68" font-size="12" fill="#333">0</text>
  <circle cx="290" cy="40" r="7" fill="#e74c3c"/>
  <text x="286" y="68" font-size="12" fill="#e74c3c">2</text>
</svg>
speak: x equals 2 is marked in red. Now let's check our answer. If we substitute 2 back into the original equation, do we get 7?
ask: What do you get when you substitute x equals 2 into 2x + 3?
`,
  },

  heart: {
    label: 'Biology — the human heart',
    response: `\
speak: Today we're going to look at the human heart. It's a four-chambered muscle that pumps blood around your entire body.
draw:
<svg viewBox="0 0 420 360" xmlns="http://www.w3.org/2000/svg">
  <!-- Heart outline -->
  <path d="M210,320 C80,220 20,140 60,80 C90,30 160,30 210,80 C260,30 330,30 360,80 C400,140 340,220 210,320 Z"
        fill="#f28b82" stroke="#c0392b" stroke-width="2"/>
  <!-- Septum -->
  <line x1="210" y1="90" x2="210" y2="300" stroke="#c0392b" stroke-width="2" stroke-dasharray="6,3"/>
  <!-- Chamber labels -->
  <text x="120" y="160" font-size="13" fill="#2c3e50" text-anchor="middle">Right</text>
  <text x="120" y="178" font-size="13" fill="#2c3e50" text-anchor="middle">Atrium</text>
  <text x="120" y="240" font-size="13" fill="#2c3e50" text-anchor="middle">Right</text>
  <text x="120" y="258" font-size="13" fill="#2c3e50" text-anchor="middle">Ventricle</text>
  <text x="300" y="160" font-size="13" fill="#1a5276" text-anchor="middle">Left</text>
  <text x="300" y="178" font-size="13" fill="#1a5276" text-anchor="middle">Atrium</text>
  <text x="300" y="240" font-size="13" fill="#1a5276" text-anchor="middle">Left</text>
  <text x="300" y="258" font-size="13" fill="#1a5276" text-anchor="middle">Ventricle</text>
  <!-- Tricuspid valve marker -->
  <line x1="175" y1="200" x2="245" y2="200" stroke="#7f8c8d" stroke-width="1.5" stroke-dasharray="4,2"/>
  <text x="210" y="195" font-size="10" fill="#7f8c8d" text-anchor="middle">valves</text>
</svg>
/position: 400,100
/anchor: top-left
speak: The dashed line down the middle is the septum. It divides the heart into a right side and a left side. The right side receives deoxygenated blood from the body and sends it to the lungs. The left side receives oxygenated blood from the lungs and pumps it back out to the body.
speak: Notice the two chambers on each side. The upper chamber is called the atrium, and it receives incoming blood. The lower chamber is called the ventricle, and it does the heavy pumping work.
play: https://www.youtube.com/watch?v=CWFyxn0qDEU
/width: 560
/height: 315
/position: 400,480
speak: Watch that short clip showing blood moving through all four chambers in real time. It really helps to see it animated.
ask: Which side of the heart — right or left — carries oxygenated blood?
/position: 400,820
`,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

const send = (ws, event) => {
  if (ws.readyState === ws.constructor.OPEN) ws.send(JSON.stringify(event));
};

/** Stream plain text with no parser — raw text_chunk events sent char-by-char. */
async function streamText(ws, text) {
  for (const ch of text) {
    send(ws, { type: 'text_chunk', content: ch });
    if (charDelay > 0) await sleep(charDelay);
  }
  send(ws, { type: 'text', content: text });
}

/**
 * Stream `response` through the Canvas parser, sending each emitted TurnEvent
 * as JSON over `ws`.
 *
 * Strategy:
 *  - SVG lines (inside draw: blocks) are sent whole-line with no per-char delay
 *    since they're structural markup and would take forever char-by-char.
 *  - All other lines stream character-by-character at `charDelay` ms each,
 *    which gives a natural typewriter feel for speak/write/ask content.
 */
async function replay(ws, response) {
  send(ws, { type: 'event', event: { type: 'tutor-started' } });
  const canvas = CanvasMedium.create();
  const parser = new OutputParser(canvas);

  const feedChunk = async chunk => {
    for await (const event of parser.parse({ type: 'text_chunk', content: chunk })) {
      send(ws, event);
    }
  };

  const lines = response.split('\n');
  let inSvg = false;

  for (const line of lines) {
    const lineWithNewline = line + '\n';

    // Track whether we're inside a draw: SVG block
    if (/^draw:/.test(line)) inSvg = true;
    if (/^[a-z_]+:/.test(line) && !/^draw:/.test(line)) inSvg = false;

    if (inSvg && line.trim().startsWith('<') || line.trim().startsWith('<!--')) {
      // SVG markup — send the whole line at once, no per-char delay
      await feedChunk(lineWithNewline);
    } else {
      // Regular text — stream character by character
      for (const ch of lineWithNewline) {
        await feedChunk(ch);
        if (charDelay > 0) await sleep(charDelay);
      }
    }
  }

  // Flush — closes the last open block
  for await (const event of parser.parse({ type: 'text', content: response })) {
    send(ws, event);
  }
  send(ws, { type: 'event', event: { type: 'tutor-ended' } });
}

// ── Build the scenario list to play ──────────────────────────────────────────

const queue = scenario === 'text'
  ? ['text']
  : scenario === 'function-graph' ? [functionGraphLesson]
    : scenario === 'function-graph-plot' ? [functionGraphExploreLesson]
      : scenario === 'question-algebra'
        ? [questionLesson]
        : scenario === 'both'
          ? [SCENARIOS.algebra, SCENARIOS.heart]
          : scenario === 'algebra'
            ? [SCENARIOS.algebra]
            : scenario === 'cuboid' || scenario === 'cuboid-volume'
              ? [cuboidLesson]
              : [SCENARIOS.heart];

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const html = readFileSync(htmlPath, 'utf8');

const http = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404); res.end();
  }
});

const wss = new WebSocketServer({ server: http });

async function play(ws, q) {
  for (let i = 0; i < q.length; i++) {
    const s = q[i];
    if (s === 'text') {
      send(ws, { type: 'session', sessionId: 'replay-text', conceptId: 'replay-text', title: TEXT_SCENARIO.label });
      await sleep(600);
      await streamText(ws, TEXT_SCENARIO.text);
    } else {
      const slug = s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      send(ws, { type: 'session', sessionId: `replay-${slug}`, conceptId: `replay-${slug}`, title: s.label });
      await sleep(600);
      await replay(ws, s.response);
    }
    if (i < q.length - 1) await sleep(1500);
  }
}

wss.on('connection', async ws => {
  console.log('Client connected — starting playback.');
  let playing = true;
  ws.on('message', async data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'message') {
        if (msg.activity?.type === 'graph-point') {
          console.log('Graph attempt:', JSON.stringify(msg.activity));
          if (playing) return;
          playing = true;
          try {
            const a = msg.activity;
            await replay(ws, a.complete
              ? `speak: You found all three points. Let's reveal the line through them.\nmodel: function-graph\n/action: plot\nwrite: These points lie on y = 2x − 3.\n`
              : a.correct ? 'speak: That point fits the equation. Try the next x value.\n'
                : 'speak: Try substituting your x value into the equation again. Multiply by 2, then subtract 3.\n');
          } finally { playing = false; }
          return;
        }
        if (msg.text === 'I am done watching') {
          send(ws, { type: 'event', event: { type: 'tutor-ended' } });
          return;
        }
        if (playing) return;
        console.log(`Replaying (triggered by: "${msg.text}")`);
        playing = true;
        try { await play(ws, queue); } finally { playing = false; }
      }
    } catch { }
  });
  try { await play(ws, queue); } finally { playing = false; }
  console.log('Playback complete.');
});

http.listen(port, () => {
  console.log(`\nCanvas test server`);
  console.log(`  Open    : http://localhost:${port}`);
  console.log(`  WS      : ws://localhost:${port}`);
  console.log(`  Scenario: ${scenario}  delay: ${charDelay}ms/char`);
  console.log(`  TTS     : ${activeTTS === 'inworld' ? 'Inworld (real audio)' : activeTTS === 'test' ? 'visual (🎤 text)' : 'none'}`);
  console.log(`\nConnect in the browser — playback starts automatically.\n`);
});
