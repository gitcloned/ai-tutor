import type { Tool } from './index.js';
import type { ConceptState } from '../types.js';
import { CS }                from '../types.js';
import { redirectToPrereq }  from './redirect.js';
import { transitionState }   from './state.js';
import { stateAction }       from '../learning/types.js';
import { isTransitionState } from '../learning/what-is-next.js';
import { buildConceptPlan }  from '../learning/stateManagement.js';
import { buildModelPrompt }  from '../learning/modelPrompt.js';
import { lp }                from '../api.js';

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
        type:        'string',
        description: 'The id of the step you just completed',
      },
      outcome: {
        type:        'string',
        enum:        ['pass', 'fail', 'done', 'not_sure'],
        description: '"pass" if correct/understood, "fail" if wrong/confused, "done" for non-interactive steps (store_memory, advance_state), "not_sure" if unclear',
      },
      nextStep: {
        type:        'string',
        description: 'Optional: explicitly set the next step id, overriding the plan\'s pass/fail routing. Use when the student\'s response warrants a specific path not captured by pass/fail alone.',
      },
    },
    required: ['id', 'outcome'],
  },
  run: async ({ id, outcome, nextStep }, ctx) => {
    const step = ctx.plan.find(s => s.id === id);
    if (!step) return { error: `Step ${id} not found` };

    ctx.log({ level: 'debug', message: `update_step | [${id}] ${stepLabel(step)} | outcome=${outcome}` });

    step.outcome = outcome as import('../types.js').PlanStep['outcome'];
    step.status  = 'done';

    // ── navigate to next step ─────────────────────────────────────────────────
    const nextId = nextStep ?? (outcome === 'fail' ? step.ifWrong : step.ifCorrect);
    let next     = nextId != null ? ctx.plan.find(s => s.id === nextId) ?? null : null;

    // If the completed step is a prereq redirect (has conceptId), skip the sequential
    // fallback — fire the redirect immediately without looking for the next plan step.
    // State-only redirects (no conceptId) still go through the fallback so that
    // terminal steps can fall through to transitionState (which handles go-to-origin).
    if (step.type === 'redirect' && (step.content as any).conceptId) {
      next = step;
    } else if (!next) {
      // Fallback: next pending step in sequence.
      // Prevents premature allDone in v2 plans where the LLM occasionally omits nextStep.
      const currentIdx = ctx.plan.findIndex(s => s.id === id);
      next = ctx.plan.slice(currentIdx + 1).find(s => s.status === 'pending') ?? null;
    }

    ctx.log({ level: 'debug', message: `update_step | next → ${next ? `[${next.id}] ${stepLabel(next)}` : 'null (terminal)'}` });

    // ── redirect step OR plan exhausted — unified navigation path ─────────────
    if (next === null || next.type === 'redirect') {
      const conceptId   = next?.content?.conceptId as string | undefined;
      const targetState = next?.content?.state     as ConceptState | undefined;

      if (next && next !== step) {
        next.status  = 'done';
        next.outcome = 'done' as any;
      }

      // ── prereq redirect: switch to another concept ──────────────────────────
      if (conceptId) {
        const conceptTitle = next!.content.conceptTitle as string;
        const prereqState  = targetState as string | undefined;
        const prereqMode: 'teach' | 'probe' = prereqState === CS.NOT_ASSESSED ? 'probe' : 'teach';
        const resumeStep   = next!.content.resumeStep as string | undefined;
        const reason       = next!.content.reason     as string | null ?? null;

        await redirectToPrereq(conceptId, conceptTitle, ctx, prereqMode, resumeStep);
        const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                       ?? ctx.plan.find(s => s.status === 'pending');
        if (firstStep) firstStep.status = 'in_progress';

        const msg = reason
          ? `${reason}. Now switching to teach "${conceptTitle}" — follow nextStep to deliver the first step of the prereq plan in this same turn.`
          : `Switching to teach "${conceptTitle}" as a prerequisite — follow nextStep to deliver the first step of the prereq plan in this same turn.`;
        return {
          ok:       true,
          message:  msg,
          nextStep: firstStep ? formatStep(firstStep) : null,
          action:   { type: 'send-ok' },
          reminder: 'Acknowledge the topic switch naturally, then immediately follow nextStep — do it all in one response.',
        };
      }

      // ── state transition: redirect current node to a specific state ─────────
      if (targetState) {
        await Promise.all([
          lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, { state: targetState }),
          lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: targetState }),
        ]);
        ctx.journeyNode.state = targetState;

        if (isTransitionState(targetState)) {
          // Transition state — rebuild plan and continue within this session.
          const { plan, models } = buildConceptPlan(ctx.concept, targetState);
          ctx.plan        = plan;
          ctx.modelPrompt = buildModelPrompt(models);
          const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                         ?? ctx.plan.find(s => s.status === 'pending');
          if (firstStep) firstStep.status = 'in_progress';
          return {
            ok:       true,
            state:    targetState,
            concept:  ctx.concept.title,
            nextStep: firstStep ? formatStep(firstStep) : null,
            message:  `State updated to "${targetState}". Now moving to ${stateAction(targetState)} phase for "${ctx.concept.title}". Follow nextStep.`,
            reminder: 'Follow the plan. Do exactly what the next step says.',
          };
        }
        // Checkpoint state — check if the next state is a transition (e.g. clarity → mastering).
        // If so, advance immediately and continue in the same session.
        const hasPlan = await transitionState(ctx);
        if (hasPlan) {
          const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                         ?? ctx.plan.find(s => s.status === 'pending');
          if (firstStep) firstStep.status = 'in_progress';
          return {
            ok:       true,
            state:    ctx.journeyNode.state,
            concept:  ctx.concept.title,
            nextStep: firstStep ? formatStep(firstStep) : null,
            message:  `State updated to "${targetState}". Now moving to ${stateAction(ctx.journeyNode.state)} phase for "${ctx.concept.title}". Follow nextStep.`,
            reminder: 'Follow the plan. Do exactly what the next step says.',
          };
        }
        return { ok: true, allDone: true, message: 'Session complete.' };
      }

      // ── plan exhausted naturally — let whatIsNext decide ───────────────────
      const hasPlan = await transitionState(ctx);
      if (hasPlan) {
        const firstStep = ctx.plan.find(s => s.status === 'in_progress')
                       ?? ctx.plan.find(s => s.status === 'pending');
        if (firstStep) firstStep.status = 'in_progress';
        return {
          ok:       true,
          state:    ctx.journeyNode.state,
          concept:  ctx.concept.title,
          nextStep: firstStep ? formatStep(firstStep) : null,
          message:  `Plan complete. Now moving to ${stateAction(ctx.journeyNode.state)} phase for "${ctx.concept.title}". Follow nextStep.`,
          reminder: 'Follow the plan. Do exactly what the next step says.',
        };
      }
      return { ok: true, allDone: true, message: 'All steps complete. Session is done.' };
    }

    // ── normal step ───────────────────────────────────────────────────────────
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
    case 'teach':         return `teach: ${c.conceptTitle ?? c.instruction ?? '?'}`;
    case 'redirect':     return c.conceptId
                           ? `redirect → ${c.conceptTitle ?? c.conceptId}`
                           : `redirect → state:${c.state ?? '?'}`;
    case 'inline':       return `inline: "${String(c.explanation ?? '').slice(0, 60)}"`;
    case 'practice':     return `practice: "${String(c.question ?? '').slice(0, 60)}"`;
    case 'resource':     return `resource: ${(c.resources as any[])?.[0]?.title ?? c.instruction ?? '?'}`;
    case 'store_memory': return 'store_memory';
    default:              return step.type;
  }
}
