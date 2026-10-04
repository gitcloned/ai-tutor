import { expect, it } from 'vitest';
import { makeSessionEvent } from '../session-meta.js';

it('describes the lesson when the WebSocket session starts', () => {
  expect(makeSessionEvent({
    session: {id:'session-1'},
    concept: {id:'linear-equations',title:'Linear equations'},
  })).toEqual({
    type:'session',
    sessionId:'session-1',
    notebookId:'session-1',
    conceptId:'linear-equations',
    title:'Linear equations',
  });
});

it('keeps the original notebook identity after a session switch',()=>{expect(makeSessionEvent({session:{id:'prereq',notebookId:'original'},concept:{id:'c',title:'C'}})).toMatchObject({sessionId:'prereq',notebookId:'original'});});
