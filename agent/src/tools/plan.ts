import type { Tool } from './index.js';
import type { ConceptState } from '../types.js';
import { redirectToPrereq } from './redirect.js';
import { transitionState }  from './state.js';

// ── read_plan ──────────────────────────────────────────────────────────────────

export const read_plan: Tool = {
  name:        'read_plan',
  description: 'Read the full teaching plan for this session.',
  schema:      { type: 'object', properties: {} },
  run: async (_args, ctx) => {
    const lines = ctx.plan.map(s =>
      `[${s.status}] ${s.id}. (${s.type}) ${JSON.stringify(s.content)}` +
      (s.ifCorrect ? ` → pass:${s.ifCorrect}` : '') +
      (s.ifWrong   ? ` → fail:${s.ifWrong}`   : '')
    );
    return { plan: lines.join('\n') || '(no plan yet)' };
  },
};

// ── get_next_step ──────────────────────────────────────────────────────────────

export const get_next_step: Tool = {
  name:        'get_next_step',
  description: 'Get the current in_progress step. Call this at the start of each turn to know exactly what to do.',
  schema:      { type: 'object', properties: {} },
  run: async (_args, ctx) => {
    const step = ctx.plan.find(s => s.status === 'in_progress')
               ?? ctx.plan.find(s => s.status === 'pending');
    if (!step) return { done: true, message: 'All steps completed.' };
    return { step: formatStep(step) };
  },
};

// ── update_step ───────────────────────────────────────────────────────────────

export const update_step: Tool = {
  name:        'update_step',
  description: 'Mark the current step done and get the next instruction. Handles state transitions, prereq redirects, and returns automatically — you never need to call advance_state or redirect_to_prereq separately.',
  schema: {
    type: 'object',
    properties: {
      id: {
        type:        'number',
        description: 'The id of the step you just completed',
      },
      outcome: {
        type:        'string',
        enum:        ['pass', 'fail', 'done', 'not_sure'],
        description: '"pass" if correct/understood, "fail" if wrong/confused, "done" for non-interactive steps (store_memory, advance_state), "not_sure" if unclear',
      },
    },
    required: ['id', 'outcome'],
  },
  run: async ({ id, outcome }, ctx) => {
    const step = ctx.plan.find(s => s.id === id);
    if (!step) return { error: `Step ${id} not found` };

    ctx.log({ level: 'debug', message: `update_step | [${id}] ${stepLabel(step)} | outcome=${outcome}` });

    step.outcome = outcome as import('../types.js').PlanStep['outcome'];
    step.status  = 'done';

    // ── advance_state step: handle state transition internally ─────────────────
    if (step.type === 'advance_state') {
      const targetState = step.content.targetState as ConceptState | undefined;
      if (targetState) {
        await transitionState(targetState, ctx);
        // ctx may now be swapped to origin concept (if this was a prereq node)
        const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                       ?? ctx.plan.find(s => s.status === 'pending');
        if (firstStep) {
          firstStep.status = 'in_progress';
          return {
            ok:       true,
            state:    ctx.journeyNode.state,
            concept:  ctx.concept.title,
            nextStep: formatStep(firstStep),
            message:  `State updated. ${ctx.journeyNode.cameFrom ? 'Returned to origin concept.' : 'Plan rebuilt.'} Follow nextStep.`,
            reminder: 'Follow the plan. Do exactly what the next step says.',
          };
        }
      }
      return { ok: true, allDone: true, message: 'Session complete.' };
    }

    // ── navigate to next step ─────────────────────────────────────────────────
    const nextId = outcome === 'fail' ? step.ifWrong : step.ifCorrect;
    const next   = nextId != null ? ctx.plan.find(s => s.id === nextId) ?? null : null;
    ctx.log({ level: 'debug', message: `update_step | next → ${next ? `[${next.id}] ${stepLabel(next)}` : 'null (terminal)'}` });

    if (!next) {
      return { ok: true, allDone: true, message: 'All steps complete. Session is done.' };
    }

    // ── teach step: handle prereq redirect internally ─────────────────────────
    // Only redirect if the step has a conceptId (probing-context teach step).
    // Learning-plan teach steps have only an instruction — they are lesson
    // delivery steps and navigate normally.
    if (next.type === 'teach' && next.content.conceptId) {
      const prereqConceptId    = next.content.conceptId    as string;
      const prereqConceptTitle = next.content.conceptTitle as string;

      // Mark the teach step as in_progress then immediately done (it's handled internally)
      next.status  = 'done';
      next.outcome = 'done' as any;

      await redirectToPrereq(prereqConceptId, prereqConceptTitle, ctx);
      // ctx is now swapped to prereq concept
      const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                     ?? ctx.plan.find(s => s.status === 'pending');
      if (firstStep) firstStep.status = 'in_progress';

      const reason = next.content.reason as string | null;
      const msg = reason
        ? `${reason}. Now teaching "${prereqConceptTitle}" — end your turn here, next turn loads the prereq plan.`
        : `Switching to teach "${prereqConceptTitle}" as a prerequisite — end your turn here, next turn loads the prereq plan.`;
      return { ok: true, action: { type: 'send-ok' }, message: msg };
    }

    // ── normal navigation ─────────────────────────────────────────────────────
    next.status = 'in_progress';

    return {
      ok:       true,
      nextStep: formatStep(next),
      reminder: 'Follow the plan. Do exactly what the next step says before responding to the student.',
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatStep(step: import('../types.js').PlanStep) {
  return { id: step.id, type: step.type, content: step.content };
}

function stepLabel(step: import('../types.js').PlanStep): string {
  const c = step.content as Record<string, any>;
  switch (step.type) {
    case 'probe':         return `probe: "${String(c.question ?? '').slice(0, 60)}"`;
    case 'teach':         return `teach: ${c.conceptTitle ?? c.conceptId ?? '?'}`;
    case 'inline':        return `inline: "${String(c.explanation ?? '').slice(0, 60)}"`;
    case 'practice':      return `practice: "${String(c.question ?? '').slice(0, 60)}"`;
    case 'resource':      return `resource: ${(c.resources as any[])?.[0]?.title ?? c.instruction ?? '?'}`;
    case 'store_memory':  return 'store_memory';
    case 'advance_state': return `advance_state → ${c.targetState ?? '?'}`;
    default:              return step.type;
  }
}
