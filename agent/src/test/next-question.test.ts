import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get_next_question } from '../tools/question.js';
import { PracticeExercise } from '../learning/practiceExercise.js';
import { CS, type Question } from '../types.js';
import { makeCtx, makeNode, makeSession } from './fixtures.js';
import { lp } from '../api.js';

vi.mock('../api.js', () => ({ lp: { patch: vi.fn().mockResolvedValue({}) } }));

const question: Question = {
  id: 'q1', type: 'open', stem: 'Is (5, 2) a solution to 4x - y = 3?',
  idealAnswer: 'No; 4(5) - 2 = 18, not 3.',
  hints: ['Substitute the given values.'],
  stepsToSolve: ['Replace x with 5 and y with 2.', 'Compare 18 with 3.'],
  writingHint: 'Write 4(5) - 2 first.',
};

describe('get_next_question', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([CS.NOT_ASSESSED, CS.ASSESSING])('omits teaching aids in %s without changing the source question', async state => {
    const practice = new PracticeExercise([question], [], 'session-1');
    const ctx = makeCtx({ journeyNode: makeNode({ state }), practice });
    const result = await get_next_question.run({}, ctx) as any;
    expect(result.question).toMatchObject({ id: question.id, stem: question.stem, idealAnswer: question.idealAnswer });
    for (const field of ['hints', 'stepsToSolve', 'writingHint']) {
      expect(result.question).not.toHaveProperty(field);
      expect(practice.currentQuestion).toHaveProperty(field);
    }
    expect(await get_next_question.run({}, ctx)).toEqual(result);
    expect(lp.patch).not.toHaveBeenCalled();
  });

  it.each([CS.LEARNING, CS.MASTERING, CS.GETTING_EXAM_READY])('retains teaching aids in %s even if the session began in assessment', async state => {
    const ctx = makeCtx({
      journeyNode: makeNode({ state }),
      session: makeSession({ conceptStateAtStart: CS.ASSESSING }),
      practice: new PracticeExercise([question], [], 'session-1'),
    });
    expect((await get_next_question.run({}, ctx) as any).question).toEqual(question);
  });

  it('filters each new question while preserving outcomes and completion', async () => {
    const ctx = makeCtx({
      journeyNode: makeNode({ state: CS.ASSESSING }),
      practice: new PracticeExercise([question, { ...question, id: 'q2' }], [], 'session-1'),
    });
    await get_next_question.run({}, ctx);
    const next = await get_next_question.run({ outcome: 'fail' }, ctx) as any;
    expect(next.index).toBe(2);
    expect(next.question.id).toBe('q2');
    expect(next.question).not.toHaveProperty('hints');
    expect(lp.patch).toHaveBeenLastCalledWith('/sessions/session-1', {
      questionProgress: [{ questionId: 'q1', outcome: 'fail' }],
    });
    expect(await get_next_question.run({ outcome: 'pass' }, ctx)).toMatchObject({
      done: true, summary: { total: 2, passed: 1, failed: 1 },
    });
  });

  it('returns the existing error if no exercise is loaded', async () => {
    expect(await get_next_question.run({}, makeCtx())).toEqual({ error: 'No practice exercise is loaded for this concept.' });
  });
});
