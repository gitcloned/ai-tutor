# Models: function-graph

## 0 (Welcome — worksheet or questions)
Greet the student warmly. Do not repeat the greeting when resuming.

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
Close the question (`question: end`), open the camera:
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

Praise one genuine thing you see in their work. Then apply the routing rubric below — pick the **first** that matches:

- Q2 wrong because they could not compute 4×5 (basic multiplication), OR both Q2 and Q3 wrong for reasons unrelated to x/y confusion → `update_step("1a", "fail", nextStep="8")`
- x and y swapped anywhere (e.g. treated (x,y) as (y,x)) → `update_step("1a", "fail", nextStep="3a")`
- Q2 or Q3 wrong → `update_step("1a", "fail", nextStep="4a")`
- Q4 wrong (cannot plot or draw the line) → `update_step("1a", "fail", nextStep="5")`
- Q2, Q3, and Q4 all correct → `update_step("1a", "pass", nextStep="2")`

## 1b (Practice questions)
practice: true

Run the question loop with `get_next_question`. After the tool returns `{ done: true }`, apply the same routing rubric — pick the **first** that matches:

- aq2 failed because the student could not compute 4×5 (showed it in working), OR both aq2 and aq3 failed for reasons unrelated to x/y confusion → `update_step("1b", "fail", nextStep="8")`
- x and y swapped in aq2 or aq3 (student treated (x,y) as (y,x)) → `update_step("1b", "fail", nextStep="3a")`
- aq2 or aq3 failed → `update_step("1b", "fail", nextStep="4a")`
- aq4 failed (could not plot or draw the line correctly) → `update_step("1b", "fail", nextStep="5")`
- aq2, aq3, and aq4 all passed → `update_step("1b", "pass", nextStep="2")`

## 2 (Ceiling — how big is the solution set?)
Ask MCQ: "How many pairs (x, y) are there altogether that satisfy the equation −3x − y = 6?"

```text
question: ceiling-mcq
/stem: How many pairs like this are there altogether?
/choice-a: One
/choice-b: Two
/choice-c: Ten
/choice-d: Infinite
```

If correct (infinite) → `update_step("2", "pass", nextStep="7")`
If wrong → `update_step("2", "fail", nextStep="5")`

## 3 (Check ordered pair understanding)
Ask MCQ: "What does an ordered pair represent?"

```text
question: ordered-pair-mcq
/stem: What does an ordered pair represent?
/choice-a: A point on a line
/choice-b: Two separate values
/choice-c: (x, y) — an x-value and a y-value
/choice-d: Not sure
```

If "a point on a line" → `update_step("3", "pass", nextStep="3a")`
If "two separate values" or "not sure" → `update_step("3", "fail", nextStep="8")`
If "(x, y)" → `update_step("3", "pass", nextStep="3a")`

## 3a (Revise ordered pairs)
redirect: checking-ordered-pair-solutions-to-equations-2
state: learning
reason: Student can substitute but gets confused by the (x, y) pair notation.
then: 7

## 4 (Check linear equation understanding)
Ask MCQ: "What shape does a linear equation produce when you plot it?"

```text
question: shape-mcq
/stem: When you plot all solutions of a linear equation, what shape do you get?
/choice-a: A circle
/choice-b: A rectangle
/choice-c: A straight line
/choice-d: Not sure
```

If "a circle", "a rectangle", or "not sure" → `update_step("4", "fail", nextStep="4a")`
If "a straight line" → `update_step("4", "pass", nextStep="3a")`

## 4a (Teach two-variable equations first)
redirect: 2-variable-linear-equations-graphs
state: learning
reason: Student does not yet understand what it means for a pair (x, y) to satisfy an equation.
then: 3

## 5 (Check if student can plot on a graph)
Open the function-graph model with the equation y = −3x − 6 (rearranged from −3x − y = 6), x-span −4 to 2, y-span −10 to 4, curve hidden.

Ask the student to find two points. For each: give x, ask for y, let them plot the point. Once two points are plotted, draw the line. Ask whether they understand.

Remove the graph. Then continue to step 7.
Call `update_step("5", "done", nextStep="7")` when complete.

## 7 (Final check before routing)
Ask: "Complete the ordered pair (−5, ___) for the equation −3x + 7y = 5x + 2y"

Correct answer: −8 (simplifies to 5y = 8x, so y = (8/5)(−5) = −8).

If correct → `update_step("7", "pass", nextStep="7b-ok")`
If wrong → `update_step("7", "fail", nextStep="7b-learn")`

## 7b-ok
state: clarity

## 7b-learn
state: learning

## 8 (Teach algebraic basics first)
redirect: algebraic-expression-basics
state: learning
reason: Student cannot substitute a value and evaluate an expression — prerequisite missing.
then: 4
