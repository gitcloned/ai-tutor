/**
 * Internal redirect helpers — not exposed as agent tools.
 * Called by update_step when it encounters teach-type steps or advance_state on prereq nodes.
 *
 * All routing state lives on journey nodes (cameFrom / goTo / preReqToLearn).
 * Sessions carry only plan state (resumeFromStep). whatIsNext() is the single
 * decision function for computing node patches.
 */

import type { AgentContext } from '../context.js';
import type { Concept, JourneyNode, PlanHistoryEntry, Session } from '../types.js';
import { CS } from '../types.js';
import { lp, cms } from '../api.js';
import { buildConceptPlan } from '../learning/stateManagement.js';
import { buildModelPrompt } from '../learning/modelPrompt.js';
import { whatIsNext } from '../learning/what-is-next.js';
import { createSession } from '../context.js';

// ── redirectToPrereq ──────────────────────────────────────────────────────────

export async function redirectToPrereq(
  prereqConceptId:    string,
  prereqConceptTitle: string,
  ctx:                AgentContext,
  mode:               'teach' | 'probe' = 'teach',
  resumeStep?:        string,
): Promise<void> {
  const originConceptId = ctx.journeyNode.conceptId;

  // Use whatIsNext as the single source of truth for node patches.
  const move = whatIsNext({
    currentNode:           { conceptId: originConceptId, state: ctx.journeyNode.state, goTo: ctx.journeyNode.goTo ?? null, cameFrom: ctx.journeyNode.cameFrom ?? null },
    supportedPhases:       ctx.concept.supportedPhases ?? [],
    resuming:              false,
    moveToPreReqConceptId: prereqConceptId,
  });

  // Patch current node → learn-pre-req-before
  if (move.updateToCurrentNode) {
    await lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, move.updateToCurrentNode);
    Object.assign(ctx.journeyNode, move.updateToCurrentNode);
  }

  // Find or create prereq journey node
  const existingNodes = await lp.get<JourneyNode[]>(
    `/journey-nodes?journeyId=${ctx.journeyNode.journeyId}&conceptId=${prereqConceptId}`,
  );

  // mode overrides the prereq start state: probe starts at not_assessed, teach at learning
  const prereqNodeState = mode === 'probe' ? CS.NOT_ASSESSED : CS.LEARNING;
  const prereqNodePatch = { ...(move.updateToNextNode ?? {}), state: prereqNodeState };

  let prereqNode = existingNodes[0];
  if (!prereqNode) {
    prereqNode = await lp.post<JourneyNode>('/journey-nodes', {
      journeyId:     ctx.journeyNode.journeyId,
      conceptId:     prereqConceptId,
      order:         0,
      masteryLevel:  null,
      preReqToLearn: null,
      ...prereqNodePatch,
    });
  } else {
    await lp.patch(`/journey-nodes/${prereqNode.id}`, prereqNodePatch);
    Object.assign(prereqNode, prereqNodePatch);
  }

  // Fetch prereq concept and build its plan
  const prereqConcept = await cms.get<Concept>(`/concepts/${prereqConceptId}`);
  const { plan: prereqPlan, models: prereqModels } = buildConceptPlan(prereqConcept, prereqNodeState);

  // Patch origin session with resumeFromStep so returnToOrigin can fast-forward the plan
  if (resumeStep) {
    ctx.session.resumeFromStep = resumeStep;
    await lp.patch(`/sessions/${ctx.session.id}`, { resumeFromStep: resumeStep });
  }

  // Create a new session for the prereq.
  // Routing back to origin is via the prereq node's cameFrom field — no cameFromSession needed.
  const prereqSession = await createSession(
    ctx.session.studentId, prereqConceptId, prereqNode.id, prereqNodeState,
  );

  // Seed planHistory and teachingPlan on the prereq session
  const entry: PlanHistoryEntry = {
    conceptId:    prereqConceptId,
    conceptTitle: prereqConceptTitle,
    plan:         prereqPlan,
    startedAt:    new Date().toISOString(),
  };
  prereqSession.planHistory.push(entry);

  const content = `Redirected to prereq: ${prereqConceptTitle}\nOrigin: ${ctx.concept.title} (will resume after)`;
  prereqSession.teachingPlan = { content, updatedAt: new Date().toISOString() };

  await lp.patch(`/sessions/${prereqSession.id}`, {
    planHistory:  prereqSession.planHistory,
    teachingPlan: prereqSession.teachingPlan,
  });

  // Swap ctx to prereq
  ctx.session     = prereqSession;
  ctx.concept     = prereqConcept;
  ctx.journeyNode = prereqNode;
  ctx.plan        = prereqPlan;
  ctx.modelPrompt = buildModelPrompt(prereqModels);

  ctx.log({ level: 'info', message: `redirect → ${prereqConceptId} (origin: ${originConceptId})` });
}

// ── returnToOrigin ────────────────────────────────────────────────────────────

export async function returnToOrigin(ctx: AgentContext, knownOriginId?: string): Promise<boolean> {
  const originConceptId = knownOriginId ?? ctx.journeyNode.goTo;
  if (!originConceptId) return false;

  const prereqConceptTitle = ctx.concept.title;

  // Find origin journey node
  const originNodes = await lp.get<JourneyNode[]>(
    `/journey-nodes?journeyId=${ctx.journeyNode.journeyId}&conceptId=${originConceptId}`,
  );
  const originNode = originNodes[0];
  if (!originNode) return false;

  // Fetch origin concept and find origin session first — they determine which plan to restore.
  const originConcept = await cms.get<Concept>(`/concepts/${originConceptId}`);

  // Find the origin session by studentId + conceptId + status=started.
  const originSessions = await lp.get<Session[]>(
    `/students/${ctx.session.studentId}/sessions?conceptId=${originConceptId}&status=started`,
  );
  const originSession = originSessions[0];
  if (!originSession) return false;

  const resumeStep = originSession.resumeFromStep;
  let originPlan: import('../types.js').PlanStep[];
  let originModels: string[] = [];

  if (resumeStep) {
    // Find the planHistory entry whose plan contains resumeStep — that is the
    // probe plan that was in progress when the redirect happened.
    // The plan's own redirect steps (e.g. 7b-ok, 7b-learn) will set the node state.
    const historyEntry = originSession.planHistory.find(
      e => e.plan.some(s => s.id === resumeStep),
    );
    if (historyEntry) {
      originPlan = historyEntry.plan;
    } else {
      // Step not found in any recorded plan — fall back to fresh teaching plan.
      ({ plan: originPlan, models: originModels } = buildConceptPlan(originConcept, CS.LEARNING));
    }
  } else {
    // No saved resume point — start fresh teaching.
    ({ plan: originPlan, models: originModels } = buildConceptPlan(originConcept, CS.LEARNING));
  }

  // Patch origin node: clear the prereq routing fields and restore a valid state.
  // When resuming a probe (resumeStep found in planHistory): set to assessing — the
  // probe plan is still in progress and its own redirect steps (7b-ok / 7b-learn)
  // will set the final state. We must leave learn-pre-req-before behind or the next
  // buildContext call will crash.
  // When building a fresh teaching plan: advance to learning.
  const resumeStepInHistory = resumeStep && originSession.planHistory.some(e => e.plan.some(s => s.id === resumeStep));
  const restoredState = resumeStepInHistory ? CS.ASSESSING : CS.LEARNING;
  const nodePatch: Record<string, unknown> = { preReqToLearn: null, state: restoredState };
  await lp.patch(`/journey-nodes/${originNode.id}`, nodePatch);
  originNode.preReqToLearn = null;
  originNode.state = restoredState;

  // Fast-forward the plan to resumeFromStep.
  if (resumeStep) {
    let found = false;
    for (const s of originPlan) {
      if (s.id === resumeStep) { s.status = 'in_progress'; found = true; break; }
      s.status = 'done';
    }
    if (!found && originPlan.length > 0) originPlan[0].status = 'in_progress';
  }

  // Append to origin session planHistory
  const entry: PlanHistoryEntry = {
    conceptId:    originConceptId,
    conceptTitle: originConcept.title,
    plan:         originPlan,
    startedAt:    new Date().toISOString(),
  };
  originSession.planHistory.push(entry);

  const resumedContent = `Returned to: ${originConcept.title}\nPrereq covered: ${prereqConceptTitle}`;
  originSession.teachingPlan = { content: resumedContent, updatedAt: new Date().toISOString() };

  await lp.patch(`/sessions/${originSession.id}`, {
    planHistory:    originSession.planHistory,
    teachingPlan:   originSession.teachingPlan,
    resumeFromStep: null,
  });

  // Mark the prereq session completed
  await lp.patch(`/sessions/${ctx.session.id}`, { status: 'completed', endedAt: new Date().toISOString() });

  // Swap ctx to origin
  ctx.session     = originSession;
  ctx.concept     = originConcept;
  ctx.journeyNode = originNode;
  ctx.plan        = originPlan;
  ctx.modelPrompt = buildModelPrompt(originModels);

  ctx.log({ level: 'info', message: `return_to_origin ← ${originConceptId} (from: ${prereqConceptTitle})` });
  return true;
}
