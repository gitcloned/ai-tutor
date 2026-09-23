/**
 * Pure function — no side effects, no async.
 *
 * Single source of truth for "what should happen after this step finishes":
 *   - Which state does the current node advance to?
 *   - Does the session stay on this concept, return to an origin, or move forward?
 *   - What DB patches should be applied to the current node and the next node?
 *
 * Callers are responsible for executing the patches and swapping ctx.
 */

import { CS } from '../types.js';
import type { ConceptState } from '../types.js';

// ── Transition vs checkpoint states ───────────────────────────────────────────

/**
 * Transition states — the student is mid-flow; the plan is in progress.
 * Sessions resume at these states (continue-current move).
 *
 * Checkpoint states (everything else) are session boundaries: a new session
 * is created to advance from them, and go-to-origin only fires when a
 * transition state completes — not when a checkpoint state is first entered.
 */
export function isTransitionState(state: ConceptState): boolean {
  return (
    state === CS.ASSESSING ||
    state === CS.LEARNING   ||
    state === CS.MASTERING  ||
    state === CS.GETTING_EXAM_READY
  );
}

// ── Return types ──────────────────────────────────────────────────────────────

export type TypeOfMove =
  | 'continue-current'    // resuming — no state change needed
  | 'advance-state'       // same concept, move to next state in progression
  | 'go-to-prereq'        // redirect to a prerequisite concept
  | 'go-to-origin'        // prereq done → return to the concept that redirected here
  | 'go-to-next-concept'; // concept fully done → advance in the journey (nextConceptId may be null)

export interface NodeUpdate {
  state?:         ConceptState;
  goTo?:          string | null;
  cameFrom?:      string | null;
  preReqToLearn?: string | null;
}

export interface WhatIsNextResult {
  typeOfMove:          TypeOfMove;
  /** The concept ID to navigate to next, or null if staying on the current concept / journey complete. */
  nextConceptId:       string | null;
  /** Patch to apply to the current journey node. Null if no change needed. */
  updateToCurrentNode: NodeUpdate | null;
  /** Patch to apply to the destination journey node. Null if no destination / no change needed. */
  updateToNextNode:    NodeUpdate | null;
}

// ── Input type ────────────────────────────────────────────────────────────────

interface CurrentNodeInput {
  /** The concept this node represents. Used as the origin conceptId for prereq routing. */
  conceptId: string;
  state:     ConceptState;
  /** Next concept in the plan sequence; also overridden to origin concept on prereq-redirect nodes. */
  goTo?:     string | null;
  /** Set only on prereq-redirect nodes — the concept that sent us here. */
  cameFrom?: string | null;
}

// ── State progression ─────────────────────────────────────────────────────────

/**
 * Compute the next state in the concept progression, respecting supportedPhases.
 *
 * supportedPhases values: 'learn' | 'master' | 'exam_readiness'
 *
 * State graph:
 *   not_assessed → assessing → learning → clarity
 *   clarity → mastering (if master)  → mastered → getting_exam_ready (if exam_readiness) → exam_ready
 *   clarity → getting_exam_ready (if exam_readiness, no master)
 *   clarity → exam_ready (neither)
 *   mastered → exam_ready (no exam_readiness)
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
  }
}

// ── Pure decision function ────────────────────────────────────────────────────

/**
 * Pure function — computes what to do next given the current node state.
 *
 * Called with the CURRENT node state (BEFORE any transition).
 * The result's updateToCurrentNode.state is the state to transition to.
 */
export function whatIsNext(params: {
  currentNode:            CurrentNodeInput;
  supportedPhases:        string[];
  resuming:               boolean;
  /** Explicitly signal "redirect to this prereq concept before continuing here." */
  moveToPreReqConceptId?: string;
}): WhatIsNextResult {
  const { currentNode, supportedPhases, resuming, moveToPreReqConceptId } = params;

  // 1. Explicit prereq redirect — caller has identified a prereq to learn first
  if (moveToPreReqConceptId) {
    return {
      typeOfMove:    'go-to-prereq',
      nextConceptId: moveToPreReqConceptId,
      updateToCurrentNode: {
        state:         CS.LEARN_PRE_REQ_BEFORE,
        preReqToLearn: moveToPreReqConceptId,
      },
      updateToNextNode: {
        state:    CS.NOT_ASSESSED,
        goTo:     currentNode.conceptId,
        cameFrom: currentNode.conceptId,
      },
    };
  }

  // 2. Resuming — pick up where the student left off, no state change
  if (resuming) {
    return {
      typeOfMove:          'continue-current',
      nextConceptId:       null,
      updateToCurrentNode: null,
      updateToNextNode:    null,
    };
  }

  // 3. Compute the next state in the progression
  const nextState = nextStateFor(currentNode.state, supportedPhases);

  // 4. No further progression — concept is already complete (or in internal-hold state)
  if (nextState === null) {
    return conceptCompleteResult(currentNode);
  }

  // 5. Prereq node completing a transition — return to origin.
  //    Only fires from transition states (assessing, learning, …) so that
  //    a prereq at a checkpoint (not_assessed) starts its own plan first.
  //    Clear goTo/cameFrom on the prereq and cameFrom on the origin so
  //    subsequent sessions don't re-trigger this redirect.
  if (currentNode.cameFrom && isTransitionState(currentNode.state)) {
    return {
      typeOfMove:          'go-to-origin',
      nextConceptId:       currentNode.cameFrom,
      updateToCurrentNode: { state: nextState, goTo: null, cameFrom: null },
      updateToNextNode:    { state: CS.LEARNING, preReqToLearn: null, cameFrom: null },
    };
  }

  // 6. Advancing to exam_ready means the concept is fully done.
  //    Combine the state update with the concept-complete routing.
  if (nextState === 'exam_ready') {
    const completeResult = conceptCompleteResult(currentNode);
    return {
      ...completeResult,
      updateToCurrentNode: {
        ...completeResult.updateToCurrentNode,
        state: 'exam_ready',
      },
    };
  }

  // 7. Normal advance within this concept
  return {
    typeOfMove:          'advance-state',
    nextConceptId:       null,
    updateToCurrentNode: { state: nextState },
    updateToNextNode:    null,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Routing once a concept has reached (or is about to reach) exam_ready. */
function conceptCompleteResult(currentNode: CurrentNodeInput): WhatIsNextResult {
  // Prereq node — return to the concept that redirected here
  if (currentNode.cameFrom) {
    return {
      typeOfMove:          'go-to-origin',
      nextConceptId:       currentNode.cameFrom,
      updateToCurrentNode: null,
      updateToNextNode: {
        state:         CS.LEARNING,
        preReqToLearn: null,
      },
    };
  }

  // Normal sequence — advance to the next concept (null = journey complete)
  return {
    typeOfMove:          'go-to-next-concept',
    nextConceptId:       currentNode.goTo ?? null,
    updateToCurrentNode: null,
    updateToNextNode:    currentNode.goTo ? { state: CS.NOT_ASSESSED } : null,
  };
}
