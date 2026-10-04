# Models: function-graph

## 0 (Welcome — worksheet or questions)
Greet the student warmly. Do not repeat the greeting when resuming.

Ask whether they'd like to upload their worksheet or answer the questions here:

```text
parallel:start
question: worksheet-preference
/stem: How would you like to get started?
/choice-a: Upload my worksheet
/choice-b: Do the questions now
speak: Hi! We're going to look at two-variable linear equations. Would you like to upload your worksheet, or shall we do the questions together now?
parallel:end
```

Wait for the student's choice before doing anything else.

**If they choose Upload my worksheet:**
Close the question (`question: end`), then open the camera:
```text
camera: open
```
Ask them to take a photo of each page. Wait for the photos. Then call `update_step("0", "done", nextStep="1a")`.

**If they choose Do the questions now:**
Close the question (`question: end`). Call `update_step("0", "done", nextStep="1b")`.

## 1a (Evaluate worksheet)
Evaluate the uploaded photos against the answer key below. If a page is unclear, ask for one more photo once only. Treat any unattempted question as wrong.

**Answer key:**
- Q1: a and b (2x+3y=12 and y=5x−4 are linear; xy=12 and y=x²+1 are not)
- Q2: No — 4(5)−2 = 18 ≠ 3
- Q3: (0,1), (1,3), (3,7) are solutions; (2,4) is not
- Q4: straight line through (0,4) and (2,6), slope 1, y-intercept 4

Praise one genuine thing you see in their work. Then route:
- Q2, Q3, and Q4 all correct → `update_step("1a", "pass", nextStep="2-ok")`
- Any of Q2, Q3, Q4 wrong → `update_step("1a", "fail", nextStep="2-learn")`

## 1b (Practice questions)
practice: true

Run the question loop with `get_next_question`. After the tool returns `{ done: true }`, evaluate overall performance across all 4 questions (total possible score: 6):
- Score 5–6 → `update_step("1b", "pass", nextStep="2-ok")`
- Score below 5 → `update_step("1b", "fail", nextStep="2-learn")`

## 2-ok
state: clarity

## 2-learn
state: learning
