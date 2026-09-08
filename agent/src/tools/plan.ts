import type { Tool } from './index.js';

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
  description: 'Mark the current step done and get the next instruction. Call after every student response.',
  schema: {
    type: 'object',
    properties: {
      id: {
        type:        'number',
        description: 'The id of the step you just completed',
      },
      outcome: {
        type:        'string',
        enum:        ['pass', 'fail', 'not_sure'],
        description: '"pass" if student answered correctly, "fail" if wrong, "not_sure" if the answer was unclear',
      },
    },
    required: ['id', 'outcome'],
  },
  run: async ({ id, outcome }, ctx) => {
    const step = ctx.plan.find(s => s.id === id);
    if (!step) return { error: `Step ${id} not found` };

    // Record outcome and mark done
    step.outcome = outcome as import('../types.js').PlanStep['outcome'];
    step.status  = 'done';

    // fail follows ifWrong; pass and not_sure follow ifCorrect
    const nextId = outcome === 'fail' ? step.ifWrong : step.ifCorrect;
    const next   = nextId != null ? ctx.plan.find(s => s.id === nextId) ?? null : null;

    if (next) {
      next.status = 'in_progress';
    }

    if (!next) {
      return {
        ok:      true,
        allDone: true,
        message: 'All steps complete. Session is done.',
      };
    }

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
