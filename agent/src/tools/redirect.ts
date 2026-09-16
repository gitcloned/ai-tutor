/**
 * Internal redirect helpers — not exposed as agent tools.
 * Called by update_step when it encounters teach-type steps or advance_state on prereq nodes.
 */

import type { AgentContext } from '../context.js';
import type { Concept, JourneyNode, PlanHistoryEntry } from '../types.js';
import { lp, cms } from '../api.js';
import { buildConceptPlan } from '../learning/stateManagement.js';

// ── redirectToPrereq ──────────────────────────────────────────────────────────

export async function redirectToPrereq(
  prereqConceptId:    string,
  prereqConceptTitle: string,
  ctx:                AgentContext,
  mode:               'teach' | 'probe' = 'teach',
): Promise<void> {
  const originConceptId = ctx.journeyNode.conceptId;
  const originNodeId    = ctx.journeyNode.id;

  const prereqNodeState = mode === 'probe' ? 'not_assessed' : 'learning';

  // Mark current node as paused
  await lp.patch(`/journey-nodes/${originNodeId}`, {
    state:         'learn-pre-req-before',
    preReqToLearn: prereqConceptId,
  });
  ctx.journeyNode.state         = 'learn-pre-req-before';
  ctx.journeyNode.preReqToLearn = prereqConceptId;

  // Find or create the prereq journey node
  const existingNodes = await lp.get<JourneyNode[]>(
    `/journey-nodes?journeyId=${ctx.journeyNode.journeyId}&conceptId=${prereqConceptId}`,
  );

  let prereqNode = existingNodes[0];
  if (!prereqNode) {
    prereqNode = await lp.post<JourneyNode>('/journey-nodes', {
      journeyId:     ctx.journeyNode.journeyId,
      conceptId:     prereqConceptId,
      order:         0,
      state:         prereqNodeState,
      masteryLevel:  null,
      goTo:          originConceptId,
      cameFrom:      originConceptId,
      preReqToLearn: null,
    });
  } else {
    await lp.patch(`/journey-nodes/${prereqNode.id}`, {
      state:    prereqNodeState,
      goTo:     originConceptId,
      cameFrom: originConceptId,
    });
    prereqNode.state    = prereqNodeState;
    prereqNode.goTo     = originConceptId;
    prereqNode.cameFrom = originConceptId;
  }

  // Fetch prereq concept and build its plan
  const prereqConcept = await cms.get<Concept>(`/concepts/${prereqConceptId}`);
  const prereqPlan    = buildConceptPlan(prereqConcept, prereqNodeState);

  // Append to planHistory
  const entry: PlanHistoryEntry = {
    conceptId:    prereqConceptId,
    conceptTitle: prereqConceptTitle,
    plan:         prereqPlan,
    startedAt:    new Date().toISOString(),
  };
  ctx.session.planHistory.push(entry);

  // Update teachingPlan
  const content = `Redirected to prereq: ${prereqConceptTitle}\nOrigin: ${ctx.concept.title} (will resume after)`;
  ctx.session.teachingPlan.content = content;

  await lp.patch(`/sessions/${ctx.session.id}`, {
    planHistory:  ctx.session.planHistory,
    teachingPlan: { ...ctx.session.teachingPlan, content, updatedAt: new Date().toISOString() },
  });

  // Swap ctx
  ctx.concept     = prereqConcept;
  ctx.journeyNode = prereqNode;
  ctx.plan        = prereqPlan;

  ctx.log({ level: 'info', message: `redirect → ${prereqConceptId} (origin: ${originConceptId})` });
}

// ── returnToOrigin ────────────────────────────────────────────────────────────

export async function returnToOrigin(ctx: AgentContext): Promise<boolean> {
  const originConceptId = ctx.journeyNode.goTo;
  if (!originConceptId) return false;

  const prereqConceptTitle = ctx.concept.title;

  // Find origin journey node
  const originNodes = await lp.get<JourneyNode[]>(
    `/journey-nodes?journeyId=${ctx.journeyNode.journeyId}&conceptId=${originConceptId}`,
  );
  const originNode = originNodes[0];
  if (!originNode) return false;

  // Resume origin node
  await lp.patch(`/journey-nodes/${originNode.id}`, {
    state:         'learning',
    preReqToLearn: null,
  });
  originNode.state         = 'learning';
  originNode.preReqToLearn = null;

  // Fetch origin concept and build its plan for the resumed state
  const originConcept = await cms.get<Concept>(`/concepts/${originConceptId}`);
  const originPlan    = buildConceptPlan(originConcept, originNode.state);

  // Append to planHistory
  const entry: PlanHistoryEntry = {
    conceptId:    originConceptId,
    conceptTitle: originConcept.title,
    plan:         originPlan,
    startedAt:    new Date().toISOString(),
  };
  ctx.session.planHistory.push(entry);

  // Update teachingPlan
  const content = `Returned to: ${originConcept.title}\nPrereq covered: ${prereqConceptTitle}`;
  ctx.session.teachingPlan.content = content;

  await lp.patch(`/sessions/${ctx.session.id}`, {
    planHistory:  ctx.session.planHistory,
    teachingPlan: { ...ctx.session.teachingPlan, content, updatedAt: new Date().toISOString() },
  });

  // Swap ctx
  ctx.concept     = originConcept;
  ctx.journeyNode = originNode;
  ctx.plan        = originPlan;

  ctx.log({ level: 'info', message: `return_to_origin ← ${originConceptId} (from: ${prereqConceptTitle})` });
  return true;
}
