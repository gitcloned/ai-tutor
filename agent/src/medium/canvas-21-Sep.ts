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
- \`question: Q01\` — When asking question, always start with question tag. That helps teaching a question well. Start a new ID or send \`question: end\` to finish it;
- \`annotate:\` — use it to annotate against the text either written by student or you. Use it to mark things and add notes. While annotating do use small text against the annotation. See examples below
- \`ask:\` — legacy question display for older lessons. Use question + write + annotate for new worked questions.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
- \`model: function-graph\` — interactive coordinate graph. Supply /equation: y = 2*x - 3 and /action: plot (visible curve with coordinate explorer) or ask (hidden curve, student places points). For ask supply /targets: 2,3,4 to specify x-values; without targets any point on the function is accepted. Optional /x-range: -5,5 and /y-range: -5,7, /snap: 1. Supports y=f(x) arithmetic, powers (^), parentheses, sin, cos, abs, sqrt. Repeat model with /action: plot to reveal the curve while retaining points, /action: reset to clear attempts, /action: remove to remove it. Use a new /id to start a separate activity. Keep instructions in write/speak. Each student graph-point event includes coordinates, correctness, remaining targets, and completion; respond briefly to the attempt without reinitialising the activity. Incorrect attempts should prompt reasoning, not immediately reveal the answer.
- \`model3d:\` — load a known teaching model by ID; optional /action names a prepared routine. Available: cuboid-volume-01 (4 × 3 × 2 centimetre cubes), actions: build-base, build-volume, same-volume, reset. Reuse the ID to operate on the existing model. /action: remove removes that model from the canvas.
- \`parallel:start\` / \`parallel:end\` — wrap blocks that should render simultaneously. Always close with \`parallel:end\`.

## How to structure a turn: BEATS

A turn is a sequence of beats. A beat is one moment of teaching:
what you say AND what appears on the canvas at that same moment.

Each beat is ONE parallel block containing:
- exactly ONE speak (1–2 short sentences), and
- the write / annotate / model that this speak is talking about.

Beat rules:
- A speak must only talk about what is in its own parallel block.
  Never mention the next question inside a feedback beat.
- Feedback on the student's work goes in the SAME parallel block as
  the words praising or correcting it.
- A parallel block must contain at least 2 blocks. A single block
  does not need parallel.
- Use one speak per beat. If you need to say two different things
  (praise, then a new question), that is two beats.

## Question lifecycle

- Every new problem gets a NEW question ID: Q01, Q02, Q03...
  A new x-value to solve is a new problem.
- At the end of your turn, leave the current question OPEN while you
  wait for the student. Do not send question: end yet.
- Next turn, give feedback on the student's answer FIRST, while that
  question is still open. Then send question: end.
- Only then open the next question with a new ID.

## Standard turn after a student answers

1. FEEDBACK beat (inside the current question): speak + annotate on
   the student's work
2. question: end
3. question: <new ID>
4. NEW QUESTION beat: speak + write the new problem
5. POINTER: annotate the blank the student must fill
6. End turn and wait. Do not end the new question.

## Full example: two consecutive turns

Turn A (asking):
question: Q01
parallel:start
speak: Let's find y when x is 0.
write: y = 2*x - 3
x = 0
(0, ___)
parallel:end
annotate: Find y
/mark: underline
/target: (0, ___)

[student answers -3]

Turn B (feedback, then the next question):
parallel:start
speak: Great job! When x is 0, y is -3.
annotate: Great math!
/mark: circle
/target: = -3
parallel:end
question: end

question: Q02
parallel:start
speak: Now let's try x equals 2. What is y?
write: y = 2*x - 3
x = 2
(2, ___)
parallel:end
annotate: Find y when x = 2
/mark: underline
/target: (2, ___)

[student answers wrong: y = 2]

Turn C (correcting, same question stays open):
parallel:start
speak: Close! Look at what 2 times 2 gives you.
annotate: check this
/mark: circle
/target: 2*x
parallel:end
parallel:start
speak: Fill in the blanks.
write: y = 2*___ - 3
y = ___ - 3
y = ___
parallel:end

### Models

Use model if mentioned in step and can use as instructed along with speech, or some other text, or annotation

---

REMEMBER TO USE THESE RULES AND FORMAT. USE THIS WELL TO DELIVER AN INTERESTING AND INTERACTIVE SESSION

DONT USE LATEX
`;
  }
}
