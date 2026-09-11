/**
 * Canvas parser tests (vitest).
 *
 * Scenarios are written as realistic LLM responses a teacher-agent would
 * produce — not synthetic one-liners. Two full teaching sessions:
 *
 *   1. Algebra — solving a two-step linear equation (speak + write + draw + ask)
 *   2. Biology — the heart diagram (speak + draw + ask + play)
 *
 * Lower-level unit tests cover attrs, passthrough, and edge cases.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Canvas }  from '../output/canvas.js';
import { Parser }  from '../output/parser.js';
import type { TurnEvent } from '../engine.js';

// Use test TTS so speak: blocks emit audio_chunk events with base64-encoded text.
// mimeType 'text/plain' lets assertions decode content without real audio.
beforeAll(() => { process.env.USE_TTS_PROVIDER = 'test'; });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function parse(
  response: string,
  opts: { chunks?: string[] } = {},
): Promise<TurnEvent[]> {
  const canvas = Canvas.create();
  const parser = new Parser(canvas);
  const results: TurnEvent[] = [];

  const chunks = opts.chunks ?? response.split('');
  for (const chunk of chunks) {
    for await (const e of parser.parse({ type: 'text_chunk', content: chunk })) results.push(e);
  }
  for await (const e of parser.parse({ type: 'text', content: response })) results.push(e);
  return results;
}

function ofType<T extends TurnEvent['type']>(
  events: TurnEvent[],
  type: T,
): Extract<TurnEvent, { type: T }>[] {
  return events.filter((e): e is Extract<TurnEvent, { type: T }> => e.type === type);
}

function eventOrder(events: TurnEvent[], ...types: TurnEvent['type'][]): boolean {
  const indices = types.map(t => events.findIndex(e => e.type === t));
  return indices.every((idx, i) => i === 0 || idx > indices[i - 1]);
}

/**
 * Groups streaming text_chunk events into write blocks.
 * Content chunks (no attrs) accumulate until a sentinel chunk (has attrs) closes the block.
 */
function collectWriteBlocks(events: TurnEvent[]): Array<{ content: string; attrs: Record<string, string> }> {
  const blocks: Array<{ content: string; attrs: Record<string, string> }> = [];
  let current = '';
  for (const e of events) {
    if (e.type !== 'text_chunk') { current = ''; continue; }
    if (!e.attrs) {
      current += e.content;
    } else {
      blocks.push({ content: current.trim(), attrs: e.attrs });
      current = '';
    }
  }
  return blocks;
}

function ttsText(event: Extract<TurnEvent, { type: 'audio_chunk' }>): string {
  return Buffer.from(event.content, 'base64').toString();
}

// ── Scenario 1: Algebra — solving 2x + 3 = 7 ──────────────────────────────────
//
// Teacher introduces the equation, walks through two steps (subtract 3, then
// divide by 2), draws a number line showing x = 2, and asks the student to
// verify by substituting back.

const ALGEBRA_RESPONSE = `\
speak: Great, let's solve this equation together. Take a close look at what's written.
write: 2x + 3 = 7
/position: 300,80
speak: Our goal is to get x by itself. The first thing we do is get rid of that plus 3. We do this by subtracting 3 from both sides.
write: 2x + 3 - 3 = 7 - 3
/position: 300,140
write: 2x = 4
/position: 300,180
speak: Now we have 2x equals 4. To find x, we divide both sides by 2.
write: x = 2
/position: 300,220
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
/position: 300,260
/anchor: center
speak: x equals 2 is marked in red. Now let's check our answer. If we substitute 2 back into the original equation, do we get 7?
ask: What do you get when you substitute x equals 2 into 2x plus 3?
/position: 300,360
`;

describe('algebra session — solving 2x + 3 = 7', () => {
  it('produces audio for every spoken sentence in the right order', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    const audio = ofType(events, 'audio_chunk');

    // Teacher speaks across several blocks — all audio should be present
    const allText = audio.map(ttsText).join(' ');
    expect(allText).toContain("let's solve this equation together");
    expect(allText).toContain('get x by itself');
    expect(allText).toContain('divide both sides by 2');
    expect(allText).toContain("Let's see where x equals 2");
    expect(allText).toContain('substitute 2 back into the original equation');
  });

  it('emits each equation step as a separate write event', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    const blocks = collectWriteBlocks(events);

    const combined = blocks.map(b => b.content).join('\n');
    expect(combined).toContain('2x + 3 = 7');
    expect(combined).toContain('2x + 3 - 3 = 7 - 3');
    expect(combined).toContain('2x = 4');
    expect(combined).toContain('x = 2');
  });

  it('attaches positional attrs to each equation write', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    const blocks = collectWriteBlocks(events);
    const positioned = blocks.filter(b => b.attrs['position']);
    // All four equation writes carry a /position
    expect(positioned.length).toBe(4);
    // The final "x = 2" carries a /size attr too
    const xEquals2 = positioned.find(b => b.content === 'x = 2');
    expect(xEquals2?.attrs['size']).toBe('large');
  });

  it('emits exactly one number-line SVG with position and anchor', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    const svgs = ofType(events, 'svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].content).toContain('<circle'); // the red dot at x=2
    expect(svgs[0].attrs['position']).toBe('300,260');
    expect(svgs[0].attrs['anchor']).toBe('center');
  });

  it('ends the turn with a single ask carrying the substitution question', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    const asks = ofType(events, 'ask');
    expect(asks).toHaveLength(1);
    expect(asks[0].content).toContain('substitute x equals 2');
    expect(asks[0].attrs['position']).toBe('300,360');
  });

  it('preserves event order: speak → write steps → draw → speak → ask', async () => {
    const events = await parse(ALGEBRA_RESPONSE, {});
    expect(eventOrder(events, 'audio_chunk', 'text_chunk', 'svg', 'ask')).toBe(true);
  });

  it('produces the same output whether streamed character-by-character or line-by-line', async () => {
    const byChar  = await parse(ALGEBRA_RESPONSE, {});
    const byLine  = await parse(ALGEBRA_RESPONSE, { chunks: ALGEBRA_RESPONSE.split('\n').map(l => l + '\n') });

    const summarise = (evs: TurnEvent[]) => ({
      audioCount: ofType(evs, 'audio_chunk').length,
      writeCount: ofType(evs, 'text_chunk').filter(w => w.attrs).length,
      svgCount:   ofType(evs, 'svg').length,
      askCount:   ofType(evs, 'ask').length,
    });

    expect(summarise(byChar)).toEqual(summarise(byLine));
  });
});

// ── Scenario 2: Biology — the heart and its chambers ──────────────────────────
//
// Teacher introduces the heart, draws a labelled cross-section SVG, explains
// blood flow chamber by chamber, links a video, and asks the student which
// side of the heart is oxygenated.

const HEART_RESPONSE = `\
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
`;

describe('biology session — the human heart', () => {
  it('draws exactly one heart SVG with chamber labels', async () => {
    const events = await parse(HEART_RESPONSE, {});
    const svgs = ofType(events, 'svg');
    expect(svgs).toHaveLength(1);

    const svg = svgs[0].content;
    expect(svg).toContain('Right');
    expect(svg).toContain('Left');
    expect(svg).toContain('Atrium');
    expect(svg).toContain('Ventricle');
    expect(svg).toContain('Septum');       // comment in the SVG
    expect(svg).toContain('valves');
  });

  it('places the heart diagram at the specified position', async () => {
    const events = await parse(HEART_RESPONSE, {});
    const svg = ofType(events, 'svg')[0];
    expect(svg.attrs['position']).toBe('400,100');
    expect(svg.attrs['anchor']).toBe('top-left');
  });

  it('emits a play event for the blood-flow video with sizing attrs', async () => {
    const events = await parse(HEART_RESPONSE, {});
    const plays = ofType(events, 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0].content).toContain('youtube.com');
    expect(plays[0].attrs['width']).toBe('560');
    expect(plays[0].attrs['height']).toBe('315');
    expect(plays[0].attrs['position']).toBe('400,480');
  });

  it('speaks all three narration passages in full', async () => {
    const events = await parse(HEART_RESPONSE, {});
    const allSpoken = ofType(events, 'audio_chunk').map(ttsText).join(' ');

    expect(allSpoken).toContain('four-chambered muscle');
    expect(allSpoken).toContain('septum');
    expect(allSpoken).toContain('deoxygenated blood');
    expect(allSpoken).toContain('atrium');
    expect(allSpoken).toContain('ventricle');
    expect(allSpoken).toContain('oxygenated blood');
    expect(allSpoken).toContain('animated');
  });

  it('ends with a single ask about oxygenated blood', async () => {
    const events = await parse(HEART_RESPONSE, {});
    const asks = ofType(events, 'ask');
    expect(asks).toHaveLength(1);
    expect(asks[0].content).toContain('oxygenated blood');
    expect(asks[0].attrs['position']).toBe('400,820');
  });

  it('event order mirrors teaching flow: speak → draw → speak → play → speak → ask', async () => {
    const events = await parse(HEART_RESPONSE, {});
    expect(eventOrder(events, 'audio_chunk', 'svg', 'play', 'ask')).toBe(true);
  });
});

// ── attrs unit tests ───────────────────────────────────────────────────────────

describe('attribute parsing', () => {
  it('attrs before content apply to the same block', async () => {
    const events = await parse('draw:\n/position: 100,200\n<svg viewBox="0 0 400 300"></svg>\n');
    expect(ofType(events, 'svg')[0].attrs['position']).toBe('100,200');
  });

  it('attrs after content apply to the same block', async () => {
    const events = await parse('draw:\n<svg viewBox="0 0 400 300"></svg>\n/position: 300,100\n');
    expect(ofType(events, 'svg')[0].attrs['position']).toBe('300,100');
  });

  it('multiple attrs all appear in the dict', async () => {
    const response = ['draw:', '<svg viewBox="0 0 400 300"></svg>', '/position: 50,50', '/anchor: top-left', '/width: 400'].join('\n') + '\n';
    expect(ofType(await parse(response), 'svg')[0].attrs).toMatchObject({ position: '50,50', anchor: 'top-left', width: '400' });
  });

  it('attrs do not bleed into the next block', async () => {
    const response = ['draw:', '<svg viewBox="0 0 400 300"></svg>', '/position: 100,100', 'ask: What do you see?'].join('\n') + '\n';
    expect(ofType(await parse(response), 'ask')[0].attrs['position']).toBeUndefined();
  });

  it('orphaned attr lines before the first key are silently ignored', async () => {
    expect(ofType(await parse('/position: 0,0\ndraw:\n<svg viewBox="0 0 400 300"></svg>\n'), 'svg')).toHaveLength(1);
  });
});

// ── speak unit tests ───────────────────────────────────────────────────────────

describe('speak modality', () => {
  it('is a no-op when no TTS provider is given', async () => {
    const prev = process.env.USE_TTS_PROVIDER;
    delete process.env.USE_TTS_PROVIDER;
    expect(ofType(await parse('speak: Hello.\n'), 'audio_chunk')).toHaveLength(0);
    process.env.USE_TTS_PROVIDER = prev;
  });

  it('splits on . and emits each sentence separately', async () => {
    const events = await parse('speak: First sentence. Second sentence. Third.\n', {});
    expect(ofType(events, 'audio_chunk')).toHaveLength(3);
  });

  it('splits on ? and !', async () => {
    const events = await parse('speak: Really? Yes! Good.\n', {});
    expect(ofType(events, 'audio_chunk')).toHaveLength(3);
  });

  it('flushes trailing text with no terminal punctuation', async () => {
    const events = await parse('speak: No punctuation here\n', {});
    const chunks = ofType(events, 'audio_chunk');
    expect(chunks).toHaveLength(1);
    expect(ttsText(chunks[0])).toBe('No punctuation here');
  });

  it('carries mimeType from TTS provider in attrs', async () => {
    const events = await parse('speak: Test.\n', {});
    expect(ofType(events, 'audio_chunk')[0].attrs['mimeType']).toBe('text/plain');
  });
});

// ── passthrough ────────────────────────────────────────────────────────────────

describe('non-text event passthrough', () => {
  it('passes tool_call through unchanged', async () => {
    const parser = new Parser(Canvas.create());
    const out: TurnEvent[] = [];
    for await (const e of parser.parse({ type: 'tool_call', name: 'read_plan', args: {} })) out.push(e);
    expect(out[0].type).toBe('tool_call');
  });

  it('passes action through unchanged', async () => {
    const parser = new Parser(Canvas.create());
    const out: TurnEvent[] = [];
    for await (const e of parser.parse({ type: 'action', action: { type: 'send-ok' } })) out.push(e);
    expect(out[0].type).toBe('action');
  });

  it('passes error through unchanged', async () => {
    const parser = new Parser(Canvas.create());
    const out: TurnEvent[] = [];
    for await (const e of parser.parse({ type: 'error', message: 'boom' })) out.push(e);
    expect(out[0].type).toBe('error');
  });
});

// ── parallel blocks ────────────────────────────────────────────────────────────

describe('parallel blocks', () => {
  const parallelActions = (events: TurnEvent[]) =>
    events.filter(e => e.type === 'action').map(e => (e as any).action.type);

  it('emits parallel-start and parallel-end around a block', async () => {
    const events = await parse('parallel:start\nspeak: Hello.\nwrite: Hi\nparallel:end\n');
    expect(parallelActions(events)).toEqual(['parallel-start', 'parallel-end']);
  });

  it('auto-closes parallel zone after 4 blocks', async () => {
    const response = 'parallel:start\nspeak: A.\nwrite: B\nspeak: C.\nwrite: D\nspeak: E.\n';
    const events = await parse(response);
    const actions = parallelActions(events);
    expect(actions[0]).toBe('parallel-start');
    expect(actions[1]).toBe('parallel-end'); // auto-closed at block 4
    // block 5 (speak: E.) is outside the parallel zone
  });

  it('ignores stray parallel:end outside a parallel block', async () => {
    const events = await parse('write: Hello\nparallel:end\nwrite: World\n');
    expect(parallelActions(events)).toHaveLength(0);
  });

  it('normal content still emits inside a parallel block', async () => {
    const events = await parse('parallel:start\nwrite: x = 2\nparallel:end\n');
    expect(ofType(events, 'text_chunk').length).toBeGreaterThan(0);
  });
});

// ── edge cases ─────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('lines before the first key are silently dropped', async () => {
    expect(ofType(await parse('Preamble\nask: Question?\n'), 'ask')).toHaveLength(1);
  });

  it('empty block emits nothing', async () => {
    expect(ofType(await parse('draw:\n'), 'svg')).toHaveLength(0);
  });

  it('parser state resets cleanly between turns on the same instance', async () => {
    const canvas = Canvas.create();
    const parser = new Parser(canvas);

    async function turn(response: string) {
      const results: TurnEvent[] = [];
      for (const ch of response.split('')) {
        for await (const e of parser.parse({ type: 'text_chunk', content: ch })) results.push(e);
      }
      for await (const e of parser.parse({ type: 'text', content: response })) results.push(e);
      return results;
    }

    const t1 = await turn('ask: Turn one?\n');
    const t2 = await turn('ask: Turn two?\n');
    expect(ofType(t1, 'ask')[0].content).toBe('Turn one?');
    expect(ofType(t2, 'ask')[0].content).toBe('Turn two?');
  });
});
