/**
 * State progression tables for the concept node lifecycle.
 *
 * Single source of truth for:
 *   - What state comes after each state (NEXT_STATE)
 *   - What the tutor does in each state (STATE_ACTION)
 *
 * Used by: stateManagement.ts, tools/plan.ts, tools/state.ts, and any other
 * file that needs to reason about state without pulling in plan-building logic.
 */

import type { ConceptState } from '../types.js';

export const NEXT_STATE: Partial<Record<ConceptState, ConceptState>> = {
  'not_assessed': 'learning',
  'learning':     'clarity',
  'clarity':      'mastered',
  'mastered':     'exam_ready',
  // 'exam_ready' → null (terminal)
  // 'learn-pre-req-before' → internal holding state, not part of the progression
};

export const STATE_ACTION: Partial<Record<ConceptState, string>> = {
  'not_assessed': 'assess',
  'learning':     'teach',
  'clarity':      'master',
  'mastered':     'prepare_for_exam',
  'exam_ready':   'ready',
};

/** The next state in the progression, or null if this is the terminal state. */
export function nextConceptState(current: ConceptState): ConceptState | null {
  return NEXT_STATE[current] ?? null;
}

/** The action label for a given state — what the tutor does in that state. */
export function stateAction(state: ConceptState): string {
  return STATE_ACTION[state] ?? 'unknown';
}
