import type { TurnEvent } from './engine.js';

type SessionSource = {
  session: { id: string; notebookId?: string };
  concept: { id: string; title: string };
};

export function makeSessionEvent(ctx: SessionSource): Extract<TurnEvent, {type:'session'}> {
  return {
    type: 'session',
    sessionId: ctx.session.id,
    notebookId: ctx.session.notebookId ?? ctx.session.id,
    conceptId: ctx.concept.id,
    title: ctx.concept.title,
  };
}
