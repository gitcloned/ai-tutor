/**
 * Internal state transition helper — not exposed as an agent tool.
 * Called by update_step when it completes an advance_state step or when the
 * plan exhausts naturally.
 *
 * Delegates all decision logic to the pure whatIsNext() function, then
 * executes the resulting patches and ctx swap.
 *
 * When advancing to a new transition state (e.g. clarity → mastering), a new
 * session is created for that state and the old session is marked completed.
 * This ensures each phase of learning has its own session record.
 */

import type { AgentContext } from '../context.js';
import type { PlanHistoryEntry } from '../types.js';
import { lp } from '../api.js';
import { buildConceptPlan } from '../learning/stateManagement.js';
import { buildModelPrompt } from '../learning/modelPrompt.js';
import { whatIsNext, isTransitionState } from '../learning/what-is-next.js';
import { createSession, loadPractice } from '../context.js';
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

  // Apply patch to current journey node (always).
  if (result.updateToCurrentNode) {
    const patch = result.updateToCurrentNode;
    await lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, patch);
    if (patch.state)                    ctx.journeyNode.state         = patch.state;
    if ('goTo' in patch)                ctx.journeyNode.goTo          = patch.goTo ?? null;
    if ('cameFrom' in patch)            ctx.journeyNode.cameFrom      = patch.cameFrom ?? null;
    if ('preReqToLearn' in patch)       ctx.journeyNode.preReqToLearn = patch.preReqToLearn ?? null;
    ctx.log({ level: 'info', message: `state → ${ctx.journeyNode.state}` });
  }

  switch (result.typeOfMove) {

    case 'advance-state': {
      if (!isTransitionState(ctx.journeyNode.state)) {
        // Checkpoint state — mark session end and let caller complete it.
        // For natural plan exhaustion, conceptStateAtEnd hasn't been set yet;
        // for redirect-step paths it was already set by update_step (idempotent).
        await lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: ctx.journeyNode.state });
        return false;
      }

      // Transition state (e.g. mastering, getting_exam_ready) — create a new session
      // for this phase and complete the old one.
      const newState = ctx.journeyNode.state;
      const newSession = await createSession(
        ctx.session.studentId,
        ctx.concept.id,
        ctx.journeyNode.id,
        newState,
        undefined,
        ctx.session.originTopicId,
      );

      const { plan, models } = buildConceptPlan(ctx.concept, newState);

      const entry: PlanHistoryEntry = {
        conceptId:    ctx.concept.id,
        conceptTitle: ctx.concept.title,
        plan,
        startedAt:    new Date().toISOString(),
      };
      newSession.planHistory.push(entry);
      newSession.notebookId = ctx.session.notebookId ?? ctx.session.id;

      await Promise.all([
        // Mark old session complete (conceptStateAtEnd was set by update_step for redirect paths,
        // or needs setting here for natural exhaustion — either way mark it done).
        lp.patch(`/sessions/${ctx.session.id}`, { status: 'completed', endedAt: new Date().toISOString() }),
        // Persist new session metadata.
        lp.patch(`/sessions/${newSession.id}`, {
          notebookId:  newSession.notebookId,
          planHistory: newSession.planHistory,
        }),
      ]);

      const practice = await loadPractice(newState, ctx.concept.id, newSession);

      // Swap ctx to the new session.
      ctx.session     = newSession;
      ctx.plan        = plan;
      ctx.modelPrompt = buildModelPrompt(models);
      if (practice) ctx.practice = practice;

      return true;
    }

    case 'go-to-origin': {
      // Prereq done — record final state on the prereq session before returning.
      if (result.updateToCurrentNode?.state) {
        await lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: ctx.journeyNode.state });
      }
      // Pass nextConceptId explicitly since goTo was cleared in the node patch above.
      return returnToOrigin(ctx, result.nextConceptId ?? undefined);
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
