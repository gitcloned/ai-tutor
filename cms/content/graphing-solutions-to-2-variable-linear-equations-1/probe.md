# Probe: Two-variable linear equations — solutions
# Concept: 2-variable-linear-equations-graphs
# Subsumes: checking-ordered-pair-solutions-to-equations-1
#           checking-ordered-pair-solutions-to-equations-2
#           graphing-solutions-to-2-variable-linear-equations-1
# Models: function-graph

## 0 (Welcome — worksheet or get started)
Greet student. Do not repeat it when resuming or returning from a prerequisite. Do not set `/answer` on this preference question.

```text
parallel:start
question: worksheet-preference
/stem: Would you like to upload your worksheet, or get started?
/choice-a: Upload my worksheet
/choice-b: Let's get started
speak: Hi! Today we'll explore linear equations together. Would you like to share your worksheet, or shall we get started?
parallel:end
```

End your turn and wait for the student's selection (or spoken or written preference). Do not send `camera: open` with the initial MCQ.

If they choose **Upload my worksheet**, respond:

```text
question: end
speak: Let's look at your worksheet. Take a photo of each page.
camera: open
```

go to step 1a

If they choose **Let's get started**, close the preference question with `question: end` and continue to Step 1 without opening the camera.

## 1a (Evaluate worksheet)
Check Q1–Q4. If a page is unclear, ask for one more photo, once. Don't guess what the child wrote.

Answers: Q1 = a, b · Q2 = No (4×5 − 2 = 18) · Q3 = (0,1), (1,3), (3,7), not (2,4) · Q4 = straight line through (−4,0), (0,4), (2,6)

Rules to follow:
 - If a qeustion is not attempted, consider it wrong

Pick the FIRST that matches:
 - Q2 wrong because it can't work out 4x, or Q2 and Q3 both wrong (not just from swapping x and y) → go to step 8
 - x and y swapped anywhere → go to step 3a
 - Q2 or Q3 wrong → go to step 4a
 - Q4 wrong → go to step 5
 - Q2, Q3, Q4 right → go to step 2

Praise one real thing from their page. Never say "wrong" or give a score. Don't explain the answers here; just move to the next step.

## 1b (Dignose)
Goal of this lesson plan is to see if a student does understand linear equations in 2 variable, understand its forms a line, and can solve for multiple combination of x and y. A student may know the concept and have mastery, may know the concept but have misconceptions, may have some pre-requisites missed, dont understand at all.

Possible path to go up the ladder for a child
 - Solved and provided two valid pairs that justify the equation
 - Understand that there could be infinite solutions for a linear equation - Use Step 2
 - Can also plot the pairs on a linear graph - Use Step 5

Possible path to go down the ladder for a child
 a) Understand the linear equation but found this question difficult - Move to step 3
   - Solved and gave different pairs by just specifying values of x, can write proper x, y pair
 b) Do not understand what does pair (x, y) means - Move to step 4
   - Can substitute and solve, but cannot specify what is pair, or write in pair format
 c) Cannot solve for y, when x is given - Move to step 8
   - Cannot solve with hints, required more than 1 hint, cannot write pairs

Approach you are using is to ask one difficult question, and up or down the path to the evaluate the student understanding.

Question to ask: "Give me two different pairs of values (x, y) that make this equation true: -3x - y = 6". Write down with steps to solve!

While trying to understand, 

 - You can give hint if a child is not able to solve. Hint should be given ONE STEP AT A TIME and should not jump!
 - If child do say he is not sure a LOT OF TIME, STOP ASKING FURTHER and decide what he should do next to learn

Follow exact hints as below, share 1 hint, while explaing do annotate term 

 - put x = 0, annotate x and let student solve

if cannot solve then next hint

 - Write -3*(0) -y = 6, annote and let student solve

if cannot solve then next hint

 - What is y, if -y = 6,  annote and let student solve

if was solving, what is the ordered pair is in case of x = 0 (__, __)


Your goal is to figure out the learning level of child and got to right next step!!

Remember, If child do say he is not sure a LOT OF TIME, STOP ASKING FURTHER and decide what he should do next to learn

## 2 (Ceiling — how big is the solution set?)
Ask MCQ question "How many pairs like this are there altogether which is a solution of the equation -3x - y = 6?"
 - one
 - two
 - ten
 - infinite

If correct, move to 7b-ok
If not, move to 5

## 3 (Go to ordered pairs)
Ask mcq "What is an ordered pair represent?"
 - Point on a line
 - 2 values
 - (x, y)
 - Not sure

If answer is point on a line, go to step 3a
If answer is 2 values or I am not sure, go to step 4
If answer is not sure, go to step 8

## 3a (Revise ordered pairs)
redirect: checking-ordered-pair-solutions-to-equations-2
mode: teach
reason: can substitute, but getting confused by terms
then: 7

## 4 (Go to two variable equation)
Ask mcq "What will you get when you plot a linear equation?"
 - A circle
 - A rectangle
 - A line
 - Not sure

If answer is a circle, or a rectange, or not sure, go to step 4a
else go to step 3a

## 4a (Teach two variable equation)
redirect: 2-variable-linear-equations-graphs
mode: teach
reason: Student does not know what it means for a pair to satisfy an equation.
then: 3

## 5 (Check if can plot on graph)
Open function-graph in ask mode, curve hidden, for the equation child is solving, ask him to plot points on the graph. point by point.

Write the equation, ask for a given x, what is y, and let child plot that point

Once done and plotted 2 or 3 points, draw the line on the graph

Ask does he understand

Remove graph

After this, continue at Step 7b-ok. nextStep: 7b-ok

## 7 (Check once before moving to clarity)
Ask: "Complete the ordered pair ( -5, ___ ) for the equation -3*x + 7*y =  5*x + 2*y"
Correct answer: −8. 

if correct, move to 7b-ok
if wrong, move to 7b-learn

## 7b-ok   
state:clarity
                                                      
## 7b-learn                 
state: learning

## 8 (teach algebraic expression)
redirect:algebraic-expression-basics
mode: teach
then: 4