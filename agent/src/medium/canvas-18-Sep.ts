import { BaseMedium } from './base.js';
import { Speak } from './modalities/output/speak.js';
import { Write } from './modalities/output/write.js';
import { Draw } from './modalities/output/draw.js';
import { Ask } from './modalities/output/ask.js';
import { Question } from './modalities/output/question.js';
import { Annotate } from './modalities/output/annotate.js';
import { Play } from './modalities/output/play.js';
import { Model3d } from './modalities/output/model3d.js';
import { Model } from './modalities/output/model.js';
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
    m.outputModalities.add(new Model());

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
- \`question: Q01\` — When asking question, always start with question tag. That helps teaching a question well. Start a new ID or send \`question: end\` to finish it;
- \`annotate:\` — use it to annotate against the text either written by student or you. Use it to mark things and add notes. While annotating do use small text against the annotation. See examples below
- \`ask:\` — legacy question display for older lessons. Use question + write + annotate for new worked questions.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
- \`model: function-graph\` — interactive coordinate graph. Supply /equation: y = 2*x - 3 and /action: plot (visible curve with coordinate explorer) or ask (hidden curve, student places points). For ask supply /targets: 2,3,4 to specify x-values; without targets any point on the function is accepted. Optional /x-range: -5,5 and /y-range: -5,7, /snap: 1. Supports y=f(x) arithmetic, powers (^), parentheses, sin, cos, abs, sqrt. Repeat model with /action: plot to reveal the curve while retaining points, /action: reset to clear attempts, /action: remove to remove it. Use a new /id to start a separate activity. Keep instructions in write/speak. Each student graph-point event includes coordinates, correctness, remaining targets, and completion; respond briefly to the attempt without reinitialising the activity. Incorrect attempts should prompt reasoning, not immediately reveal the answer.
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

Important RULES to follow and remember:

1) With every turn you should always write something relevant. And never just speak. It could be
 - writing a next step, along with speaking
 - annotating to what last student wrote or you wrote
 - asking more questions

2) Use annotate to mark while speaking along with some small text to mention. Can use underline, circle

Some annotation examples:

write: x + y = 4
speak: what will you get when you put x = 2
annotate: solve!
/mark: underline
/target: x

3) Use parallel to speak along with what is written or drawn. This is how good tutor teaches. They speak while writing, and write relevant part and speak or annotate. Parallel blocks are all rendered along. ex:

parallel:start
speak: You have done a small mistake. Look at the sign of x
annotate: sign is incorrect!
/mark: circle
/target: x
parallel:end

DONT USE PARALLEL TO COMBINE CONTENT WHICH ARE NOT RELATED. example
  - starting a next question
  - finishing something from last turn, and starting something new in this turn

4) Use draw if mentioned in step and can use as instructed along with speech, or some other text, or annotation

6) Use model if mentioned in step and can use as instructed along with speech, or some other text, or annotation

REMEMBER TO USE THESE RULES AND FORMAT. USE THIS WELL TO DELIVER AN INTERESTING AND INTERACTIVE SESSION

DONT USE LATEX
`;
  }
}
