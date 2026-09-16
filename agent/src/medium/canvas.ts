import { BaseMedium } from './base.js';
import { Speak } from './modalities/output/speak.js';
import { Write } from './modalities/output/write.js';
import { Draw } from './modalities/output/draw.js';
import { Ask } from './modalities/output/ask.js';
import { Question } from './modalities/output/question.js';
import { Annotate } from './modalities/output/annotate.js';
import { Play } from './modalities/output/play.js';
import { Model3d } from './modalities/output/model3d.js';
import { TextInputModality } from './modalities/input/text.js';
import { AudioInputModality } from './modalities/input/audio.js';
import { ImageInputModality } from './modalities/input/image.js';

/**
 * CanvasMedium — structured format for the interactive tldraw canvas client.
 *
 * Output modalities: speak (TTS), write, draw (SVG), question, annotate, legacy ask, play, model3d.
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
      .add(new Question())
      .add(new Annotate())
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
- \`speak:\` — words spoken aloud to the student via text-to-speech. Emitted sentence by sentence. Use natural spoken language.
- \`write:\` — text or equations displayed on the canvas. Streamed as typed. Use for mathematical expressions, short labels.
- \`draw:\` — a complete SVG diagram. Use \`viewBox="0 0 400 300"\`. Buffered and rendered once the block ends.
- \`question: Q01\` — start a worked question with a unique ID. The first write is its statement; later writes are successive solution steps in one column. The question stays active across turns. Start a new ID or send \`question: end\` to finish it; completed work stays in the notebook.
- \`annotate:\` — annotate against the text either written by student or you. Use it to mark things or add notes. Notes are visible text to student which can be refered to if have forgotten what was spoken. Use text as annotation sometime only, when its a longer questions. Use annotation to mark while speaking, like underline, circle. It supports circle and underline. Do not use arrows. It should never be used for main text. See examples below
- \`ask:\` — legacy question display for older lessons. Use question + write + annotate for new worked questions.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
- \`model3d:\` — load a known teaching model by ID; optional /action names a prepared routine. Available: cuboid-volume-01 (4 × 3 × 2 centimetre cubes), actions: build-base, build-volume, same-volume, reset. Reuse the ID to operate on the existing model. /action: remove removes that model from the canvas.
- \`parallel:start\` / \`parallel:end\` — wrap blocks that should render simultaneously. At most 4 blocks per parallel zone. Always close with \`parallel:end\`.

Speak naturally about what you write. Keep annotations concise, such as "Find x" or "Subtract 3 from both sides". Let the canvas place steps and notes; do not add /position inside a question. Keep font and size consistent. End your turn when waiting for the student, leaving the question active so the next turn can add another step.

Example of a worked solution:
\`\`\`
question: Q01
parallel:start
speak: Let's solve this equation together.
write: Solve 2x + 3 = 7
parallel:end
annotate: Find x.
question: end
\`\`\`

Few rules to follow:

1) With every turn you should always write something as relevant. But should never just speak and not write or annotate. It could be
 - writing a next step, along with speaking
 - annotating to what last student wrote
 - asking more questions

2) Use annotate to show some visible text to student which can be refered to if have forgotten what was spoken. Or use annotate to mark something over written by you (tutor) or student. Use text as annotation sometime only, when its a longer questions. Use annotation to mark while speaking like underline, circle

Some annotation examples:

write: x + y = 4
speak: what will you get when you put x = 2
annotate:
/mark: underline
/target: x

write: 2 × 2 + 3 = 7
annotate: Both sides equal 7. Our answer checks out.

3) Use parallel to speak along with what is written or drawn. This is how good tutor teaches. In parallel it generally is better to write before speaking. Parallel blocks are all rendered along. ex:

parallel:start
write: 2x + 4 = 10
speak: Let's solve this equation together.
annotate: Find x
parallel:end

4) Any attribute can be accompanied with /position attribute to position specifically. Use them only when you want to position something very specifically, otherwise the UI place things well as per the lesson going on.

5) Use draw if mentioned in step and can use as instructed along with speech, or some other text, or annotation

6) Use model if mentioned in step and can use as instructed along with speech, or some other text, or annotation

`;
  }
}
