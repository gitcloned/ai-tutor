import { BaseOutput } from './base.js';
import { Speak }      from './modalities/speak.js';
import { Write }      from './modalities/write.js';
import { Draw }       from './modalities/draw.js';
import { Ask }        from './modalities/ask.js';
import { Play }       from './modalities/play.js';

/**
 * Canvas output — structured format for the interactive tldraw canvas client.
 *
 * The LLM responds using known keys (speak:, write:, draw:, ask:, play:).
 * Each key is handled by its own modality. The speak: modality auto-resolves
 * its TTS provider from the USE_TTS_PROVIDER environment variable.
 *
 * Private constructor: use Canvas.create() to get a properly wired instance.
 * One instance per transport connection (modalities are stateful across turns).
 */
export class Canvas extends BaseOutput {
  private constructor() { super(); }

  static create(): Canvas {
    const c = new Canvas();
    c.modalities
      .add(new Speak())
      .add(new Write())
      .add(new Draw())
      .add(new Ask())
      .add(new Play());
    return c;
  }

  promptTemplate(): string {
    const keyList = this.modalities.keys().map(k => `\`${k}:\``).join(', ');
    return `## Canvas Output Format

Respond using ONLY the following keys: ${keyList}

Each key starts on a new line followed by a colon. Content continues on the same line and on subsequent lines until the next key is encountered at the start of a line.

Key behaviours:
- \`speak:\` — words spoken aloud to the student via text-to-speech. Emitted sentence by sentence. Use natural spoken language.
- \`write:\` — text or equations displayed on the canvas. Streamed as typed. Use for mathematical expressions, short labels.
- \`draw:\` — a complete SVG diagram. Use \`viewBox="0 0 400 300"\`. Buffered and rendered once the block ends.
- \`ask:\` — a question for the student. Canvas pauses and waits for their response. One question per ask block.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
- \`parallel:start\` / \`parallel:end\` — let speech and the following visual/question overlap, then wait at the end marker.
- \`parallel:start\` / \`parallel:end\` — wrap blocks that should render simultaneously (e.g. speak + write appearing at the same time). At most 4 blocks per parallel zone. Always close with \`parallel:end\`.

Example:
\`\`\`
speak: Let's look at this equation together.
write: 5x - 2 = 3
parallel:start
speak: To solve for x, we isolate it on one side. First, add 2 to both sides.
write: 5x = 5
parallel:end
draw:
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <line x1="40" y1="150" x2="360" y2="150" stroke="black" stroke-width="2"/>
  <text x="200" y="140" text-anchor="middle" font-size="18">5x = 5</text>
</svg>
ask: What is the value of x?
\`\`\``;
  }
}
