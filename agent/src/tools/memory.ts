import type { Tool } from './index.js';
import { lp } from '../api.js';

export const store_memory: Tool = {
  name:        'store_memory',
  description: 'Persist an observation about the student for future sessions.',
  schema: {
    type: 'object',
    properties: {
      type:    { type: 'string', enum: ['factual', 'reflected'], description: 'factual = what they know; reflected = what they consistently struggle with' },
      content: { type: 'string', description: 'The observation in one or two sentences' },
    },
    required: ['type', 'content'],
  },
  run: async ({ type, content }, ctx) => {
    await lp.post(`/students/${ctx.session.studentId}/memories`, {
      context: { conceptId: ctx.concept.id },
      type,
      content,
    });
    return { ok: true };
  },
};
