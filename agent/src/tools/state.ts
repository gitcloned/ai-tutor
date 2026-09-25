/**
 * Internal state transition helper — not exposed as an agent tool.
 * Called by update_step when it completes an advance_state step or when the
 * plan exhausts naturally.
 *
 * Delegates all decision logic to the pure whatIsNext() function, then
 * executes the resulting patches and ctx swap.
 */

import type { AgentContext } from '../context.js';
import type { Concept, JourneyNode } from '../types.js';
import { CS } from '../types.js';
import { lp, cms } from '../api.js';
import { buildConceptPlan } from '../learning/stateManagement.js';
import { buildModelPrompt } from '../learning/modelPrompt.js';
import { whatIsNext, isTransitionState } from '../learning/what-is-next.js';
import { hasQuestionsJson, loadQuestionsFromJson } from '../learning/plan-builder-v2.js';
import { PracticeExercise } from '../learning/practiceExercise.js';
import { returnToOrigin } from './redirect.js';

/**
 * Advance the current concept node to its next state and update ctx accordingly.
 *
 * Returns true  if there is a new plan ready (caller should show nextStep).
 * Returns false if the journey is complete or nothing changed.
 */
export async function transitionState(ctx: AgentContext): Promise<boolean> {
  const result = whatIsNext({
    currentNode: {
      conceptId: ctx.concept.id,
      state:     ctx.journeyNode.state,
      goTo:      ctx.journeyNode.goTo,
      cameFrom:  ctx.journeyNode.cameFrom,
    },
    supportedPhases: ctx.concept.supportedPhases ?? [],
    resuming: false,
  });

  // Apply patch to current node
  if (result.updateToCurrentNode) {
    const patch = result.updateToCurrentNode;
    const promises: Promise<unknown>[] = [
      lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, patch),
    ];
    if (patch.state) {
      promises.push(lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: patch.state }));
    }
    await Promise.all(promises);
    if (patch.state)                    ctx.journeyNode.state         = patch.state;
    if ('goTo' in patch)                ctx.journeyNode.goTo          = patch.goTo ?? null;
    if ('cameFrom' in patch)            ctx.journeyNode.cameFrom      = patch.cameFrom ?? null;
    if ('preReqToLearn' in patch)       ctx.journeyNode.preReqToLearn = patch.preReqToLearn ?? null;
    ctx.log({ level: 'info', message: `state → ${ctx.journeyNode.state}` });
  }

  switch (result.typeOfMove) {

    case 'advance-state': {
      // Checkpoint state reached — session ends here; next session handles it via buildContext.
      if (!isTransitionState(ctx.journeyNode.state)) return false;
      // Transition state — rebuild plan and continue within this session.
      const { plan, models } = buildConceptPlan(ctx.concept, ctx.journeyNode.state);
      ctx.plan        = plan;
      ctx.modelPrompt = buildModelPrompt(models);
      // Load practice questions if advancing to mastering.
      if (ctx.journeyNode.state === CS.MASTERING && !ctx.practice) {
        const conceptId = ctx.concept.id;
        if (hasQuestionsJson(conceptId)) {
          const questions = loadQuestionsFromJson(conceptId);
          if (questions.length) ctx.practice = new PracticeExercise(questions, [], ctx.session.id);
        }
      }
      return true;
    }

    case 'go-to-origin': {
      // Prereq done — pass nextConceptId explicitly since goTo was cleared in the patch above
      const returned = await returnToOrigin(ctx, result.nextConceptId ?? undefined);
      return returned;
    }

    case 'go-to-next-concept': {
      // Concept is fully done — session ends; the next session via buildContext
      // will advance to the next concept.
      return false;
    }

    case 'continue-current':
    case 'go-to-prereq':
    default:
      return false;
  }
}
