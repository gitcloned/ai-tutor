/**
 * Internal state transition helper — not exposed as an agent tool.
 * Called by update_step when it completes an advance_state step.
 */

import type { AgentContext } from '../context.js';
import type { ConceptState } from '../types.js';
import { lp } from '../api.js';
import { buildConceptPlan } from '../learning/stateManagement.js';
import { returnToOrigin } from './redirect.js';

export async function transitionState(targetState: ConceptState, ctx: AgentContext): Promise<void> {
  await Promise.all([
    lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, { state: targetState }),
    lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: targetState }),
  ]);
  ctx.journeyNode.state = targetState;
  ctx.log({ level: 'info', message: `state → ${targetState}` });

  // If this is a prereq node (has goTo), return to origin after advancing
  const returned = await returnToOrigin(ctx);
  if (returned) return;

  // Otherwise rebuild the plan for the new state in this concept.
  // If the state is not yet implemented (throws "not yet implemented"), leave the plan
  // empty so the callers fall through to allDone gracefully.
  try {
    ctx.plan = buildConceptPlan(ctx.concept, targetState);
  } catch (err) {
    if (err instanceof Error && err.message.includes('not yet implemented')) {
      ctx.plan = [];
    } else {
      throw err;
    }
  }
}
