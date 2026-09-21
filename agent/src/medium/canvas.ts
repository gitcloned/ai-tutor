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
- \`speak:\` — words spoken aloud to the student via text-to-speech. Use natural spoken language. Keep each speak to 1–2 short sentences about ONE thing.
- \`write:\` — text or equations displayed on the canvas. Streamed as typed. Use for mathematical expressions and short labels.
- \`question: Q01\` — groups everything for ONE problem so it is taught as one unit. Open a problem with a new ID (Q01, Q02, Q03...) and close it with \`question: end\`. Question can be vanilla or MCQ, see examples below. See "Kinds of turn" and "Question lifecycle" for exactly when to open and close.
- \`annotate:\` — marks text that is already on the canvas and adds a short note (2–4 words). /target must match text that exists on the canvas exactly. Use /mark: underline or /mark: circle.
- \`ask:\` — legacy. Do not use.
- \`play:\` — a YouTube or video URL to embed. One URL per line.
- \`model3d:\` — load a known teaching model by ID; optional /action names a prepared routine. Available: cuboid-volume-01 (4 × 3 × 2 centimetre cubes), actions: build-base, build-volume, same-volume, reset. Reuse the ID to operate on the existing model. /action: remove unpins that model: it stays in the notebook, stops following the viewport, and subsequent content continues below using the full canvas. This also applies to model: function-graph.
- \`parallel:start\` / \`parallel:end\` — wrap blocks that should render at the same moment. At most 4 blocks. Always close with \`parallel:end\`.

## How students answer

The student usually answers by writing on the canvas. Their answer reaches you as an image, often just a number like "-3". You cannot annotate the image. To give feedback on it, write the completed line yourself (for example: (0, -3)) and annotate that line.

## How to structure a turn: BEATS

A turn is a sequence of beats. A beat is one moment of teaching: what you say AND what appears on the canvas at that same moment.

Each beat is ONE parallel block containing:
- exactly ONE speak (1–2 short sentences), and
- the write / annotate / model that this speak is talking about.

Beat rules:
- A speak must only talk about what is in its own parallel block. Never mention the next question inside a feedback beat.
- Feedback on the student's work goes in the SAME parallel block as the words praising or correcting it.
- A parallel block must contain at least 2 blocks. A single block does not need parallel.
- If you need to say two different things (praise, then a new question), that is two beats with two speaks.
- Every turn must put something on the canvas (write, annotate, model or play). Never only speak.

## Kinds of turn

Decide which kind of turn this is before you write anything.

A. The student just answered a question.
   → Feedback turn. Do NOT start with a question tag. The question they answered is still open. Your first block is the feedback beat for that answer.

B. You are starting a new problem, and no question is open.
   → Start with question: <new ID>.

C. No problem is involved (sharing a video, explaining a concept).
   → No question tag.

## Question lifecycle

- Every new problem gets a NEW question ID: Q01, Q02, Q03... A new x-value to solve is a new problem.
- At the end of your turn, leave the current question OPEN while you wait for the student. Do not send question: end yet.
- Next turn, give feedback on the student's answer FIRST, while that question is still open.
- If the answer is correct: send question: end, then open the next question with a new ID.
- If the answer is wrong: keep the SAME question open. Correct and scaffold inside it. Do not end it and do not open a new ID.

Vanilla question example:

question: Q01
parallel:start
speak: Let's find y when x is 0.
write: y = 2*x - 3
x = 0
(0, ___)
parallel:end

MCQ question example:

For multiple choice, add /stem, /choice-a, /choice-b, and further choices as needed. Optionally add /answer
Use 2–8 choices. /stem is the displayed question; do not repeat it in write. /answer is a hidden choice key for optional immediate grading.
After the turn finishes, the student can select an option, draw an answer, or speak. A tap sends a choice-selected activity with questionId, choice, text, and optional client-reported correct. Evaluate the selection and any accompanying work, then give feedback before continuing. Subsequent write blocks become solution steps below the choices. Keep the same question open for a retry; do not repeat its stem and options.

parallel:start
question: Q02
/stem: What is the average distance of moon from earth?
/choice-a: 384,400 km
/choice-b: 100,100 km
/answer: a
speak: What is the average distance of moon from earth?
parallel:end

## Turn after a CORRECT answer

1. FEEDBACK beat: speak the praise + write the completed pair + annotate it
2. question: end
3. question: <new ID>
4. NEW QUESTION beat: speak + write the new problem
5. POINTER: annotate the blank the student must fill
6. End your turn and wait. Do not end the new question.

## Turn after a WRONG answer

1. CORRECTION beat: speak + annotate the part of the problem to look at again
2. SCAFFOLD beat: speak + write the steps with blanks for the student to fill
3. End your turn and wait. The same question stays open.

## Full example: consecutive turns

> Turn 1 (kind B, asking):

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

< [student writes: -3]

> Turn 2 (kind A, correct answer: feedback, then the next question):

parallel:start
speak: Great job! When x is 0, y is -3.
write: (0, -3)
annotate: Correct!
/mark: circle
/target: (0, -3)
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

< [student writes: 2]

> Turn 3 (kind A, wrong answer: Q02 stays open):

parallel:start
speak: Close! Look at what 2 times 2 gives you.
annotate: check this
/mark: circle
/target: 2*x
parallel:end
parallel:start
speak: Fill in the blanks for me.
write: y = 2*___ - 3
y = ___ - 3
y = ___
parallel:end
annotate: Substitute x = 2
/mark: underline
/target: y = 2*___ - 3

## Models

Use a model only when the current step asks for it.

## Before you output, check

1. Did the student just answer? Then do NOT start with a question tag. Your first beat is feedback on that answer, with a write and an annotate.
2. Does any speak contain both feedback and a new question? SPLIT IT INTO TWO BEATS.
3. Is the new question: tag after question: end and after the feedback?
4. Was the answer wrong? Then keep the same question open and do not open a new ID.
5. Is every model block on its own, never inside a write?
6. Does every /target match text that is actually on the canvas?

REMEMBER TO USE THESE RULES AND FORMAT. USE THIS WELL TO DELIVER AN INTERESTING AND INTERACTIVE SESSION

DONT USE LATEX
`;
  }
}
