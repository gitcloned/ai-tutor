import type { Concept, ConceptState, PlanStep, PlanStepType } from './types.js';

/**
 * Build the initial teaching plan for a concept + state.
 *
 * For not_assessed: compiles the probing tree into a cursor-navigable step graph.
 *   Each step has ifCorrect / ifWrong pointers to the next step id.
 *   The update_step tool receives an outcome and returns the next step — the agent
 *   never navigates the tree itself.
 *
 * For other states: returns a flat ordered list (navigation pointers are linear).
 */
export function buildPlan(concept: Concept, state: ConceptState): PlanStep[] {
  switch (state) {
    case 'not_assessed': return buildProbingPlan(concept);
    case 'learning':     return buildTeachingPlan(concept);
    case 'clarity':      return buildMasteryPlan('lots');
    case 'mastered':     return buildMasteryPlan('hots');
    default:             return [step(1, { instruction: `Work through "${concept.title}" with the student` }, 'probe')];
  }
}

// ── Probing plan ───────────────────────────────────────────────────────────────

function buildProbingPlan(concept: Concept): PlanStep[] {
  if (concept.probingTree?.nodes?.length) {
    return compileProbingTree(concept.probingTree);
  }
  // Fallback for concepts without a probing tree — flat linear plan
  return linearPlan([
    step(1, { instruction: `Ask a probing question about "${concept.title}"` }, 'probe'),
    step(2, { instruction: 'Store a memory: what the student knows and where they got stuck' }, 'store_memory'),
    step(3, { instruction: 'Advance state to "learning"' }, 'advance_state'),
  ]);
}

/**
 * Compile a probing tree JSON into a flat step array with navigation pointers.
 *
 * The tree is walked recursively. Each node becomes a numbered PlanStep.
 * After compilation, all null pointers (terminal branches) are wired to the
 * store_memory step, which chains to advance_state.
 *
 * The agent's job is simple:
 *   - Do what the current in_progress step says
 *   - Call update_step(id, outcome) when done
 *   - The tool returns the next step — agent follows that instruction
 */
export function compileProbingTree(tree: { nodes: any[]; entryQuestion?: any }): PlanStep[] {
  const compiled: PlanStep[] = [];
  let nextId = 1;

  function alloc(type: PlanStepType, content: Record<string, unknown>): PlanStep {
    const s: PlanStep = { id: nextId++, content, status: 'pending', type, ifCorrect: null, ifWrong: null };
    compiled.push(s);
    return s;
  }

  // Returns first step id of the compiled branch, or null (= terminal)
  function compileBranch(branch: any): number | null {
    if (!branch) return null;

    switch (branch.type) {
      case 'steps': {
        const nodes: any[] = branch.steps ?? [];
        return nodes.length ? compileNode(nodes[0]) : null;
      }

      case 'teach': {
        const s = alloc('teach', { conceptId: branch.conceptId, conceptTitle: branch.title, reason: branch._comment ?? null });
        const next = branch.thenAsk ? compileNode(branch.thenAsk) : null;
        s.ifCorrect = next;
        s.ifWrong   = next;
        return s.id;
      }

      case 'inline': {
        const s = alloc('inline', { explanation: branch.content });
        const next = branch.thenAsk ? compileNode(branch.thenAsk) : null;
        s.ifCorrect = next;
        s.ifWrong   = next;
        return s.id;
      }

      case 'question':
        return null; // terminal — student is ready, fall through to store_memory

      default:
        return null;
    }
  }

  function compileNode(node: any): number {
    const s = alloc('probe', { question: node.probe, idealAnswer: node.idealAnswer });
    s.ifCorrect = compileBranch(node.ifCorrect);
    s.ifWrong   = compileBranch(node.ifWrong);
    return s.id;
  }

  // Compile entry question as root probe (if present)
  // pass → terminal (student solved it, no need to diagnose)
  // fail → first diagnostic node
  let entryStep: PlanStep | null = null;
  if (tree.entryQuestion) {
    entryStep = alloc('probe', extractEntryQuestion(tree.entryQuestion));
    // ifWrong wired below after compiling nodes; ifCorrect stays null → store_memory
  }

  // Compile the root nodes
  let firstNodeId: number | null = null;
  for (const node of (tree.nodes ?? [])) {
    const id = compileNode(node);
    if (firstNodeId === null) firstNodeId = id;
  }

  // Wire entry question's fail path into the diagnostic tree
  if (entryStep) {
    entryStep.ifWrong = firstNodeId;
  }

  // Add terminal steps
  const storeStep   = alloc('store_memory',  { instruction: 'Store what you learned about this student' });
  const advanceStep = alloc('advance_state', { instruction: 'Advance state to "learning"', targetState: 'learning' });

  storeStep.ifCorrect = advanceStep.id;
  storeStep.ifWrong   = advanceStep.id;
  // advance_state is truly terminal — both pointers stay null

  // Wire all remaining null pointers to storeStep
  for (const s of compiled) {
    if (s.id === storeStep.id || s.id === advanceStep.id) continue;
    if (s.ifCorrect === null) s.ifCorrect = storeStep.id;
    if (s.ifWrong   === null) s.ifWrong   = storeStep.id;
  }

  // First step starts in_progress
  if (compiled.length > 0) compiled[0].status = 'in_progress';

  return compiled;
}

// ── Teaching plan ─────────────────────────────────────────────────────────────

/**
 * Build the learning plan from the concept's lessonPlan (ido/wedo/youdo steps).
 *
 * For each lesson step:
 *   1. `resource` step — agent shares the video URL(s) with the student
 *      (falls back to `teach` step with the instruction if no video attached)
 *   2. `practice` step — agent asks the learning indicator / assessment question
 *
 * Ends with `advance_state → clarity`.
 */
function buildTeachingPlan(concept: Concept): PlanStep[] {
  let nextId = 1;
  const steps: PlanStep[] = [];

  function alloc(type: PlanStepType, content: Record<string, unknown>): void {
    steps.push(step(nextId++, content, type));
  }

  const ORDER: Record<string, number> = { ido: 0, wedo: 1, youdo: 2 };
  const sorted = [...(concept.lessonPlan ?? [])].sort(
    (a, b) => (ORDER[a.type] ?? 99) - (ORDER[b.type] ?? 99),
  );

  for (const ls of sorted) {
    const resources = ls.resources ?? [];

    // Step 1: deliver the content — video if available, verbal instruction otherwise
    if (resources.length > 0) {
      alloc('resource', {
        lessonType:  ls.type,
        instruction: ls.instruction ?? null,
        resources:   resources.map(r => ({
          id:         r.id,
          title:      r.title,
          youtubeUrl: r.youtubeUrl ?? null,
          url:        r.url ?? null,
        })),
      });
    } else {
      alloc('teach', {
        lessonType:  ls.type,
        instruction: ls.instruction ?? `${ls.type.toUpperCase()} step`,
      });
    }

    // Step 2: practice question
    // Priority: assessmentQuestion stem → learningIndicator text → mastery question (for wedo/youdo)
    const indicator = ls.learningIndicator;
    const aq        = indicator?.assessmentQuestion;
    let question: string | null = (aq?.stem) ? aq.stem : (indicator?.text ?? null);
    let questionId: string | null = aq?.id ?? null;

    if (!question && ls.type !== 'ido') {
      const fallbackQ = (concept as any).masteryQuestions?.[0];
      if (fallbackQ) {
        question   = (fallbackQ as any).stem ?? null;
        questionId = (fallbackQ as any).id   ?? null;
      }
    }

    if (question) {
      alloc('practice', {
        lessonType:        ls.type,
        question,
        questionId,
        learningIndicator: indicator?.text ?? null,
      });
    }
  }

  // Fallback when concept has no lesson plan yet
  if (steps.length === 0) {
    alloc('teach',    { lessonType: 'ido', instruction: `Teach "${concept.title}" with a concrete example` });
    alloc('practice', { question: `Can you solve an example of ${concept.title}?`, lessonType: 'youdo' });
  }

  alloc('advance_state', { instruction: 'Advance state to "clarity"', targetState: 'clarity' });
  return linearPlan(steps);
}

// ── Mastery plan ──────────────────────────────────────────────────────────────

function buildMasteryPlan(level: 'lots' | 'hots'): PlanStep[] {
  return linearPlan([
    step(1, { instruction: `Present a ${level === 'lots' ? 'LOTS' : 'MOTS/HOTS'} mastery question` }, 'probe'),
    step(2, { instruction: "Assess the student's answer — probe if wrong, affirm if correct" }, 'probe'),
    step(3, { instruction: level === 'lots'
      ? 'Advance state to "mastered" once student clears LOTS consistently'
      : 'Advance state to "exam_ready" once student clears HOTS',
              targetState: level === 'lots' ? 'mastered' : 'exam_ready' }, 'advance_state'),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function step(id: number, content: Record<string, unknown>, type: PlanStepType): PlanStep {
  return { id, content, status: 'pending', type, ifCorrect: null, ifWrong: null };
}

/** Wire a flat list of steps linearly: each step's ifCorrect points to the next. */
function linearPlan(steps: PlanStep[]): PlanStep[] {
  steps.forEach((s, i) => {
    s.ifCorrect = steps[i + 1]?.id ?? null;
    s.ifWrong   = steps[i + 1]?.id ?? null;
  });
  if (steps.length > 0) steps[0].status = 'in_progress';
  return steps;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a probe-ready content object from a Perseus entryQuestion.
 * The agent receives the question text and ideal answer.
 * The full perseusContent is preserved for the real UI later.
 */
function extractEntryQuestion(eq: any): Record<string, unknown> {
  const perseus = eq.perseusContent ?? {};
  const question = perseus.content ?? 'Solve the entry question.';

  // Find the correct answer from numeric-input widgets
  let idealAnswer: string | undefined;
  for (const widget of Object.values(perseus.widgets ?? {}) as any[]) {
    if (widget.type === 'numeric-input') {
      const correct = (widget.options?.answers ?? []).find((a: any) => a.status === 'correct');
      if (correct != null) {
        idealAnswer = String(correct.value);
        break;
      }
    }
  }

  return { question, idealAnswer, perseusContent: perseus };
}

// ── Serialise / deserialise ───────────────────────────────────────────────────

export function serialisePlan(steps: PlanStep[]): string {
  return JSON.stringify(steps);
}

export function deserialisePlan(content: string): PlanStep[] {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
