# Testing worked questions

Run from `agent/`:

```sh
npm run build
node scripts/canvas.mjs --scenario question-algebra --tts test --port 32014
```

Connect canvas to `ws://localhost:32014`. The executable response lives in `question-lesson.mjs`.

## End conditions in this replay

1. **Explicit end:** Q01 ends with `question: end`. Its solution and notes stay on the canvas.
2. **Same ID continues:** Q02 sends `question: Q02` again before writing `x = 4`. This remains in the same question.
3. **New ID ends the previous question:** `question: Q03` closes Q02 and starts a separate worked example below it.
4. **Writing after end:** Q03 ends explicitly, then `write: We solved three equations.` appears outside any question.

Speech, annotations, legacy `ask`, audio completion, and a tutor turn ending do not close a question. A subsequent turn can add steps to the active question. Starting a new lesson creates a new notebook page, so its writes do not join the old page's question. Disconnecting preserves the notebook; it does not emit `question: end`.

## Visual checks

- Question groups have no visible background, border, or generic Question heading.
- Notes have the wider column, including when reopening an older notebook.
- Notes appear beside steps without connecting arrows.
- Circle and underline marks can have no accompanying note.
- A tall note leaves enough room before the following step.
