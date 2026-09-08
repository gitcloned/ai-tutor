import type { Tool } from './index.js';
import type { ConceptState } from '../types.js';
import { lp } from '../api.js';

export const advance_state: Tool = {
  name:        'advance_state',
  description: 'Transition the student\'s concept state. Call this only when the current plan is complete and the student is ready to move forward.',
  schema: {
    type: 'object',
    properties: {
      state:   { type: 'string', enum: ['learning', 'clarity', 'mastered', 'exam_ready'], description: 'The state to transition to' },
      summary: { type: 'string', description: 'One or two sentences summarising what was accomplished in this state' },
    },
    required: ['state', 'summary'],
  },
  run: async ({ state, summary }, ctx) => {
    await Promise.all([
      lp.patch(`/journey-nodes/${ctx.journeyNode.id}`, { state }),
      lp.patch(`/sessions/${ctx.session.id}`, { conceptStateAtEnd: state }),
    ]);
    ctx.journeyNode.state = state as ConceptState;
    console.log(`[state] → ${state} | ${summary}`);
    return { ok: true, state };
  },
};
