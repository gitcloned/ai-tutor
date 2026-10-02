/**
 * @prodigy/progression — shared pure progression rules
 *
 * Canonical source of truth for concept state transitions and
 * next-concept selection. Used by LP server (via @prodigy/progression)
 * and mirrored in agent/src/learning/what-is-next.ts (which is a copy
 * kept in sync manually because the agent lives outside the CMS workspace).
 *
 * All functions are pure — no side effects, no async, no DB calls.
 */

import { CS } from '@prodigy/types';
import type { ConceptState } from '@prodigy/types';

export type { ConceptState };
export { CS };

// ── Terminal state check ───────────────────────────────────────────────────────

/**
 * Returns true when a concept node is fully done given its supportedPhases.
 * Missing nodes (undefined state) are treated as not_assessed, never terminal.
 */
export function isTerminalForConcept(
  state: ConceptState | undefined | null,
  supportedPhases: string[],
): boolean {
  if (!state) return false;
  if (state === CS.EXAM_READY) return true;
  if (state === CS.MASTERED) {
    // Terminal only if exam_readiness phase is not supported
    return !supportedPhases.includes('exam_readiness');
  }
  if (state === CS.CLARITY) {
    // Terminal only if neither master nor exam_readiness supported
    return !supportedPhases.includes('master') && !supportedPhases.includes('exam_readiness');
  }
  return false;
}

// ── Transition vs checkpoint states ───────────────────────────────────────────

/**
 * Transition states — student is mid-flow; plan is in progress.
 * Sessions resume at these states (continue-current move).
 * Checkpoint states are session boundaries.
 */
export function isTransitionState(state: ConceptState): boolean {
  return (
    state === CS.ASSESSING ||
    state === CS.LEARNING   ||
    state === CS.MASTERING  ||
    state === CS.GETTING_EXAM_READY
  );
}

// ── State progression ─────────────────────────────────────────────────────────

/**
 * Compute the next state in the concept progression, respecting supportedPhases.
 *
 * supportedPhases values: 'learn' | 'master' | 'exam_readiness'
 *
 * Returns null when there is no further progression (terminal or internal-hold state).
 */
export function nextStateFor(
  current:         ConceptState,
  supportedPhases: string[],
): ConceptState | null {
  const hasMaster    = supportedPhases.includes('master');
  const hasExamReady = supportedPhases.includes('exam_readiness');

  switch (current) {
    case CS.NOT_ASSESSED:        return CS.ASSESSING;
    case CS.ASSESSING:           return CS.LEARNING;
    case CS.LEARNING:            return CS.CLARITY;
    case CS.CLARITY:
      if (hasMaster)             return CS.MASTERING;
      if (hasExamReady)          return CS.GETTING_EXAM_READY;
      return CS.EXAM_READY;
    case CS.MASTERING:           return CS.MASTERED;
    case CS.MASTERED:
      if (hasExamReady)          return CS.GETTING_EXAM_READY;
      return CS.EXAM_READY;
    case CS.GETTING_EXAM_READY:  return CS.EXAM_READY;
    case CS.EXAM_READY:
    case CS.LEARN_PRE_REQ_BEFORE:
      return null;
    default:
      return null;
  }
}

// ── Topic next-concept selection ──────────────────────────────────────────────

export interface ConceptSummary {
  id:              string;
  order:           number;
  supportedPhases: string[];
  /** tie-break for equal order values */
  tieBreakId?:     string;
}

export interface NodeSummary {
  conceptId:      string;
  topicId?:       string | null;
  state:          ConceptState;
  lastActivity?:  Date | string | null;
  cameFrom?:      string | null;
  preReqToLearn?: string | null;
}

export type NextLearningResult =
  | { status: 'completed' }
  | { status: 'unavailable'; reason: string }
  | {
      status:           'continue';
      originTopicId:    string;
      conceptId:        string;
      state:            ConceptState | 'not_assessed';
      isPrereqHop:      boolean; // true when chosen concept is outside originTopicId
    };

/**
 * Pure function — picks the next concept to study in a given topic.
 *
 * @param topicId            The topic being studied (origin)
 * @param conceptsInOrder    CMS concepts for this topic, sorted by order ascending
 * @param nodeByConceptId    Map of conceptId → current journey node (may be incomplete)
 * @param allJourneyNodes    All journey nodes across all student journeys (for prereq lookup)
 */
export function selectNextConcept(
  topicId:         string,
  conceptsInOrder: ConceptSummary[],
  nodeByConceptId: Map<string, NodeSummary>,
  allJourneyNodes: NodeSummary[],
): NextLearningResult {
  if (conceptsInOrder.length === 0) {
    return { status: 'unavailable', reason: 'Topic has no concepts' };
  }

  const conceptIds = conceptsInOrder.map(c => c.id);

  // Build supportedPhases lookup
  const phasesByConceptId = new Map(conceptsInOrder.map(c => [c.id, c.supportedPhases]));

  // 1. All concepts terminal? → completed
  const allTerminal = conceptsInOrder.every(c => {
    const node = nodeByConceptId.get(c.id);
    return isTerminalForConcept(node?.state, c.supportedPhases);
  });
  if (allTerminal) return { status: 'completed' };

  // 2. Find most recently active unfinished node for this topic
  const topicNodes = conceptsInOrder
    .map(c => nodeByConceptId.get(c.id))
    .filter((n): n is NodeSummary => {
      if (!n) return false;
      const phases = phasesByConceptId.get(n.conceptId) ?? [];
      return !isTerminalForConcept(n.state, phases) && !!n.lastActivity;
    })
    .sort((a, b) => {
      const ta = a.lastActivity ? new Date(a.lastActivity as string).getTime() : 0;
      const tb = b.lastActivity ? new Date(b.lastActivity as string).getTime() : 0;
      return tb - ta;
    });

  let chosen: NodeSummary | null = topicNodes[0] ?? null;

  // Follow prerequisite chain — guard against cycles with stable visited set
  const visited = new Set<string>();
  let isPrereqHop = false;
  let depth = 0;
  const MAX_DEPTH = 30;

  while (chosen && chosen.state === CS.LEARN_PRE_REQ_BEFORE && depth < MAX_DEPTH) {
    const prereqId: string | null | undefined = chosen.preReqToLearn;
    if (!prereqId) break;
    if (visited.has(prereqId)) {
      return { status: 'unavailable', reason: `Prerequisite cycle detected at concept '${prereqId}'` };
    }
    visited.add(prereqId);

    // Find prereq node across ALL journey nodes (may be outside this topic)
    const prereqNode: NodeSummary | null = allJourneyNodes.find(n => n.conceptId === prereqId) ?? null;
    if (!prereqNode) break; // prereq node not yet created — agent will create it

    const prereqPhases = phasesByConceptId.get(prereqId) ?? [];
    if (isTerminalForConcept(prereqNode.state, prereqPhases)) break; // prereq done — unblock

    isPrereqHop = !conceptIds.includes(prereqId); // outside topic boundary
    chosen = prereqNode;
    depth++;
  }

  if (chosen && depth >= MAX_DEPTH) {
    return { status: 'unavailable', reason: 'Prerequisite chain too deep — possible cycle' };
  }

  if (chosen) {
    return {
      status:        'continue',
      originTopicId: topicId,
      conceptId:     chosen.conceptId,
      state:         chosen.state,
      isPrereqHop,
    };
  }

  // 3. No recently active node → pick last unassessed concept by CMS order
  //    "Last" = highest order (KA-style: start from the endpoint, prereqs pull you back)
  //    Treat existing not_assessed nodes as also unassessed
  const unassessedConcepts = conceptsInOrder.filter(c => {
    const node = nodeByConceptId.get(c.id);
    return !node || node.state === CS.NOT_ASSESSED;
  });

  if (unassessedConcepts.length > 0) {
    // Sort by order desc; use id as stable tiebreaker
    unassessedConcepts.sort((a, b) => {
      if (b.order !== a.order) return b.order - a.order;
      return (b.tieBreakId ?? b.id) > (a.tieBreakId ?? a.id) ? 1 : -1;
    });
    const last = unassessedConcepts[0]!;
    return {
      status:        'continue',
      originTopicId: topicId,
      conceptId:     last.id,
      state:         'not_assessed',
      isPrereqHop:   false,
    };
  }

  // 4. All assessed but not all terminal — some are in-progress states without lastActivity
  //    Pick the last in-progress concept by CMS order
  const inProgressConcepts = conceptsInOrder.filter(c => {
    const node = nodeByConceptId.get(c.id);
    if (!node) return false;
    return !isTerminalForConcept(node.state, c.supportedPhases);
  });

  if (inProgressConcepts.length > 0) {
    const last = inProgressConcepts[inProgressConcepts.length - 1]!;
    const node = nodeByConceptId.get(last.id)!;
    return {
      status:        'continue',
      originTopicId: topicId,
      conceptId:     node.conceptId,
      state:         node.state,
      isPrereqHop:   false,
    };
  }

  return { status: 'completed' };
}
