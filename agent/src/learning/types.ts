/**
 * Display labels for concept states — what the tutor does in each state.
 *
 * The authoritative state progression logic lives in `learning/what-is-next.ts`.
 */

import { CS } from '../types.js';
import type { ConceptState } from '../types.js';

const STATE_ACTION: Partial<Record<ConceptState, string>> = {
  [CS.NOT_ASSESSED]:       'assess',
  [CS.ASSESSING]:          'assess',
  [CS.LEARNING]:           'teach',
  [CS.CLARITY]:            'master',
  [CS.MASTERING]:          'master',
  [CS.MASTERED]:           'prepare_for_exam',
  [CS.GETTING_EXAM_READY]: 'prepare_for_exam',
  [CS.EXAM_READY]:         'ready',
};

/** The action label for a given state — what the tutor does in that state. */
export function stateAction(state: ConceptState): string {
  return STATE_ACTION[state] ?? 'unknown';
}
