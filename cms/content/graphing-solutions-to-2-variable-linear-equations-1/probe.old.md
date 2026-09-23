# Probe: Two-variable linear equations — solutions
# Concept: 2-variable-linear-equations-graphs
# Subsumes: checking-ordered-pair-solutions-to-equations-1
#           checking-ordered-pair-solutions-to-equations-2
#           graphing-solutions-to-2-variable-linear-equations-1
# Models: function-graph

## 1 (Entry — production)
Greet and start.

Ask: "Give me two different pairs of values (x, y) that make this equation true: 3y = 6x + 3."

If they give only one pair: say "Good. Now give me a second one, different from that."
  If they then give a second pair → route below.
  If they say there isn't another → MISCONCEPTION: solution set is a single point → go to Step 5. nextStep: 5

If both pairs use x = 0, or the two pairs are identical: say "Now try one where x isn't 0." Then route.

Route based on the error pattern across BOTH pairs:
  Correct pairs — e.g., (0,1) (1,3) (−1,−1) (2,5) → nextStep: 2
  y = 2x + 3 error — e.g., (0,3) (1,5) — divided 6x but not the 3 → nextStep: 6a
  y = 6x + 3 error — e.g., (0,3) (1,9) — ignored the 3y → nextStep: 6a
  y = 6x + 1 error — e.g., (0,1) (1,7) — divided the 3 but not the 6x → nextStep: 6a
  Values right but coordinates reversed — e.g., (1,0) (3,1) → nextStep: 6b
  No pattern; x and y picked independently with no equation use → nextStep: 4
  Blank / "I don't know" / refuses to try → nextStep: 3

## 2 (Ceiling — how big is the solution set?)
Ask MCQ question "How many pairs like this are there altogether?"
 - one
 - two
 - ten
 - infinite

If correct, move to 7b-ok

If not, move to 5

## 2a (Model: let them see the solution set)
Open function-graph in ask mode, curve hidden, equation y = 2x + 1.

Plot the student's own two pairs from Step 1 on the graph.
Ask them to place a THIRD point they believe is a solution — before computing it.
The prediction is what you're assessing; do not let them work it out first.

  Places it on the line → they have the mapping. Reveal the curve → nextStep: 7a
  Places it off the line → do not correct immediately. Ask them to check that pair in the
    equation. Let the contradiction do the work. Then reveal the curve → nextStep: 7b

After revealing the curve (do not clear their points): ask "what do all these points have in common?"

## 3 (Frozen — switch from production to recognition)
Ask: "Sam says x = 0, y = 1 works for 3y = 6x + 3. Priya says x = 1, y = 3 works. Who is right?"
Correct answer: both are right.

  "Both", with a check or verification → they can verify but not generate → nextStep: 6c
  Picks only one → MISCONCEPTION: solution set is a single point → nextStep: 5
  Cannot judge either → nextStep: 4

## 4 (Localise: does "solution" mean anything to them?)
Ask: "y = 2x − 3. Riya says x = 3, y = 4. Arjun says x = 5, y = 7. Who is right, and how can you tell?"
Correct: Arjun. 2(5) − 3 = 7 is true; 2(3) − 3 = 3, not 4.

  Correct, explains by substituting → they know what a solution is; gap is procedural → nextStep: 6a
  Correct, cannot explain → ask "show me how you checked" once. Then → nextStep: 6a
  Wrong or guessing → nextStep: 6d

## 5 (Teach: a two-variable equation has many solutions)
Open function-graph in ask mode, curve hidden, equation y = 2x + 1.

Do NOT explain first. Work through it together:
  Find (0,1) together and plot it.
  Find (1,3) together and plot it.
  Find (−1,−1) together and plot it.
  Ask "can we keep going?" — let them find the fourth point alone.
Only after they find a fourth point: reveal the curve.
Only then say the idea aloud: every point on that line is another solution, and they never run out.

After this, continue at Step 7b-ok. nextStep: 7b-ok

## 6a (Teach: divide every term, not just some)
redirect: checking-ordered-pair-solutions-to-equations-2
mode: teach
reason: Student divided only part of the equation when isolating y (partial division error).
then: 7b

## 6b (Teach: coordinate order — first is x, second is y)
redirect: checking-ordered-pair-solutions-to-equations-1
mode: teach
reason: Student's values were correct but coordinates were reversed. Say so first before teaching.
then: 7b

## 6c (Teach: generating solutions by choosing x freely)
redirect: graphing-solutions-to-2-variable-linear-equations-1
mode: teach
reason: Student can verify solutions but cannot generate them. Focus: pick any x, then solve for y.
then: 7b

## 6d (Teach: what a two-variable equation is)
redirect: 2-variable-linear-equations-graphs
mode: teach
reason: Student does not know what it means for a pair to satisfy an equation.
then: 7b

## 7a (Confirm — stepped up, for a student who arrived correct)
Ask: "Complete the ordered pair ( ___, −2 ) for the equation x − 5y = −15."
Correct answer: −25. This adds solving for the harder variable and works with negatives.

  −25 → state = clarity. Topic complete. nextStep: __store
  −5 → sign slip on −5 × −2. Give one retry: "check just that multiplication step."
    Self-corrects → clarity. nextStep: __store
    Still stuck → state = learning, stop. nextStep: __store
  2.6 → substituted −2 for x instead of y → note as reversal error. nextStep: __store
  Other wrong → state = learning, stop for today. nextStep: __store

## 7b (Confirm — equivalent difficulty, after any teach branch)
Ask: "Give me two different pairs (x, y) that make  2y = 8x + 10  true."
Correct: simplifies to y = 4x + 5, so valid pairs include (0,5), (1,9), (−1,1), etc.

  Correct → nextStep: 7b-ok
  Wrong → nextStep: 7b-weak

## 7b-ok                                                                                    
state: clarity                                                                              
                                                                                            
## 7b-weak                                                                                  
state: learning