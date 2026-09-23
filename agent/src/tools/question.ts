import type { Tool } from './index.js';
import type { QuestionOutcome } from '../types.js';

/**
 * get_next_question — the single tool for driving a practice exercise.
 *
 * First call (start of practice): call with no arguments to receive the first question.
 * Subsequent calls: pass `outcome` for the question the student just answered.
 *   The tool records the outcome, persists it to the session, and returns the next question.
 * When all questions are answered it returns a done summary.
 *
 * The tool is only available in the mastering skill (and getting_exam_ready when added).
 * ctx.practice is guaranteed to exist when this tool is callable — buildContext loads it
 * whenever the concept has mastery questions and the state is mastering.
 */
export const get_next_question: Tool = {
  name:        'get_next_question',
  description: 'Get the next practice question. On subsequent calls, pass the outcome for the question you just presented before fetching the next one.',
  schema: {
    type: 'object',
    properties: {
      outcome: {
        type:        'string',
        enum:        ['pass', 'fail', 'not_sure'],
        description: 'How the student did on the current question. Omit on the very first call.',
      },
    },
    required: [],
  },
  async run(args, ctx) {
    if (!ctx.practice) {
      return { error: 'No practice exercise is loaded for this concept.' };
    }
    const outcome = args['outcome'] as QuestionOutcome | undefined;
    const result  = await ctx.practice.next(outcome);

    if (result.done) {
      const { total, passed, failed } = result.summary;
      return {
        done:    true,
        message: `Practice complete. ${passed}/${total} correct.`,
        summary: { total, passed, failed },
      };
    }

    return {
      done:     false,
      index:    result.index,
      total:    result.total,
      question: {
        id:          result.question.id,
        stem:        result.question.stem,
        idealAnswer: result.question.idealAnswer,
        type:        result.question.type,
      },
    };
  },
};
