import { BaseMedium }            from './base.js';
import { Speak }                 from './modalities/output/speak.js';
import { Write }                 from './modalities/output/write.js';
import { Draw }                  from './modalities/output/draw.js';
import { Ask }                   from './modalities/output/ask.js';
import { Play }                  from './modalities/output/play.js';
import { Model3d }               from './modalities/output/model3d.js';
import { TextInputModality }     from './modalities/input/text.js';
import { AudioInputModality }    from './modalities/input/audio.js';
import { ImageInputModality }    from './modalities/input/image.js';

/**
 * CanvasMedium — structured format for the interactive tldraw canvas client.
 *
 * Output modalities: speak (TTS), write, draw (SVG), ask, play (video), model3d.
 * Input modalities:  text (identity), audio (Groq Whisper STT), image (inline data).
 *
 * Both TTS and STT providers are auto-resolved from environment variables at
 * construction time — no runtime configuration needed.
 *
 * Private constructor: use CanvasMedium.create() to get a properly wired instance.
 * One instance per transport connection (output modalities are stateful across turns).
 */
export class CanvasMedium extends BaseMedium {
  private constructor() { super(); }

  static create(): CanvasMedium {
    const m = new CanvasMedium();

    m.outputModalities
      .add(new Speak())
      .add(new Write())
      .add(new Draw())
      .add(new Ask())
      .add(new Play())
      .add(new Model3d());

    m.inputModalities
      .add(new TextInputModality())
      .add(new AudioInputModality())
      .add(new ImageInputModality());

    return m;
  }

  promptTemplate(): string {
    const keyList = this.outputModalities.keys().map(k => `\`${k}:\``).join(', ');
    return `## Canvas Output Format

Respond using ONLY the following keys: ${keyList}

Each key starts on a new line followed by a colon. Content continues on the same line and on subsequent lines until the next key is encountered at the start of a line.

Key behaviours:
- \`model3d:\` — load a known teaching model by ID; optional /action names a prepared routine. Available: cuboid-volume-01 (4 × 3 × 2 centimetre cubes), actions: build-base, build-volume, same-volume, reset. Reuse the ID to operate on the existing model. /action: remove removes that model from the canvas. End your turn after asking a student a question.
- \`speak:\` — words spoken aloud to the student via text-to-speech. Emitted sentence by sentence. Use natural spoken language.
- \`write:\` — text or equations displayed on the canvas. Streamed as typed. Use for mathematical expressions, short labels.
- \`draw:\` — a complete SVG diagram. Use \`viewBox="0 0 400 300"\`. Buffered and rendered once the block ends.
- \`ask:\` — a question for the student. Canvas pauses and waits for their response. One question per ask block.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
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
