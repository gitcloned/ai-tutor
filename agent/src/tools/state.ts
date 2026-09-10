/**
 * Internal state transition helper — not exposed as an agent tool.
 * Called by update_step when it completes an advance_state step.
 */

import type { AgentContext } from '../context.js';
import type { ConceptState } from '../types.js';
import { lp } from '../api.js';
import { buildPlan } from '../plan-builder.js';
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

  // Otherwise rebuild the plan for the new state in this concept
  ctx.plan = buildPlan(ctx.concept, targetState);
}
