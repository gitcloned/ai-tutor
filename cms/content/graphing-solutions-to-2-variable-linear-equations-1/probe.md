# Models: function-graph

## 0 (Rubric and welcome)
Use this rubric for both routes. Choose the first supported learning need; an earlier untested capability does not block routing to an observed difficulty. Use the probing skill's evidence and stopping rules.

| Learning level or misconception | Evidence | Next step |
|---|---|---|
| Missing algebraic basics | Working shows difficulty substituting, evaluating an expression, or solving for y after substitution, supported by their working or explanation. | Go to step 3. |
| Confused by ordered pairs | Working shows swapped coordinates or difficulty interpreting or writing (x, y), while calculation with explicit values is possible. | Go to step 4. |
| Needs two-variable linear equations and the meaning of a solution | Remains unsure how to recognise a linear equation or decide whether a pair makes it true from their independent attempt or explanation. No stronger evidence points to an earlier prerequisite gap. | Go to step 5. |
| Needs graphing solutions | Can find or verify pairs, but needs help plotting them, connecting them as a line, or understanding that the line contains infinitely many solutions. | Go to step 6. |
| Understands independently | Can recognise a linear equation, find and verify pairs, plot the solution line, and explain why it contains infinitely many solutions. | Go to step 7. |

**Only when needed to distinguish destinations:** Ask the student to substitute x = 5, y = 2 into 4x − y (algebra versus solution meaning), or identify x in (5, 2) (pair notation versus solution meaning). Do not supply the substitution before testing it. If graphing is correct but the size of the solution set is unknown, ask how many solutions the line represents and why.

**Fallback:** If uncertainty persists or the student wants to stop assessment, teach the best-supported learning need above. If no specific gap is established, go to step 5 as an introduction, recording that understanding is unassessed rather than claiming a prerequisite misconception.

**Teaching continuation:** The rubric selects the entry point. After each prerequisite lesson, follow its `then:` destination without reassessing: algebraic basics → two-variable linear equations → ordered-pair solutions → graphing solutions (steps 3 → 5 → 4 → 6).

### Welcome

Greet the student. Do not repeat the greeting when resuming. Do not set `/answer` on this preference question.

```text
parallel:start
question: worksheet-preference
/stem: How would you like to get started?
/choice-a: Upload my worksheet
/choice-b: Do the questions now
speak: Hi! We're going to look at two-variable linear equations. Would you like to upload your worksheet, or shall we do the questions together now?
parallel:end
```

Wait for their choice. Close the preference question with `question: end`.

- Upload my worksheet: open the camera with `camera: open`, ask for a photo of each page, and wait for the photos. Then go to step 1.
- Do the questions now: go to step 2 without opening the camera.

Use outcome `done` and supply `nextStep` when moving from this welcome to either assessment route.

## 1 (Assess the worksheet)
Apply the rubric in step 0 to the uploaded work. For the matching worksheet:

- Q1: a and b — 2x + 3y = 12 and y = 5x − 4 are linear; xy = 12 and y = x² + 1 are not.
- Q2: No — 4(5) − 2 = 18, not 3.
- Q3: (0,1), (1,3), and (3,7) are solutions; (2,4) is not.
- Q4: A straight line through (−4,0), (0,4), and (2,6).

Route directly to the rubric's destination once supported. Any necessary clarification stays within this step.

## 2 (Assess through questions)
Use `get_next_question` with `questions/assessing.json` as diagnostic material and apply the rubric in step 0 after each response. Follow the probing skill's question-bank and stopping rules; this is not a full practice exercise.

Q1 tests recognising linear equations; Q2 and Q3 provide evidence about substitution, pairs, and solution meaning; Q4 tests graphing. Use a focused clarification when it could change the destination. Do not continue through Q3 or Q4 just to finish the bank if an earlier learning need is already supported.

## 3 (Learn algebraic basics)
redirect: algebraic-expression-basics
mode: teach
reason: The student needs support with substitution, evaluation, or solving for a variable.
then: 5

## 4 (Learn ordered-pair solutions)
redirect: checking-ordered-pair-solutions-to-equations-2
mode: teach
reason: The student can calculate but needs support interpreting or writing ordered pairs.
then: 6

## 5 (Learn two-variable linear equations)
redirect: 2-variable-linear-equations-graphs
mode: teach
reason: The student needs support understanding linear equations and what makes a pair a solution.
then: 4

## 6 (Learn graphing solutions)
state: learning

## 7 (Concept understood)
state: clarity
