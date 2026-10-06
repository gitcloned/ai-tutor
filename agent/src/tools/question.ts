import type { Tool } from './index.js';
import type { QuestionOutcome } from '../types.js';
import { CS } from '../types.js';

/**
 * get_next_question — the single tool for driving a practice exercise.
 *
 * First call (start of practice): call with no arguments to receive the first question.
 * Subsequent calls: pass `outcome` for the question the student just answered.
 *   The tool records the outcome, persists it to the session, and returns the next question.
 * When all questions are answered it returns a done summary.
 *
 * Assessment states receive evaluation material without teaching aids. Other states
 * retain the full question. Filtering never changes the stored exercise.
 */
export const get_next_question: Tool = {
  name: 'get_next_question',
  description: 'Read the current question. During assessment, idealAnswer is private evaluation material: do not reveal it or use it to coach the student. Teaching aids are included only outside assessment. Omit outcome to reread without advancing. Pass outcome only when the whole attempt is finished or deliberately stopped to record its result and advance.',
  schema: {
    type: 'object',
    properties: {
      outcome: {
        type: 'string',
        enum: ['pass', 'fail', 'not_sure'],
        description: 'Final outcome for the whole current question. Omit when starting, rereading, giving help, or evaluating an intermediate solution step.',
      },
    },
    required: [],
  },
  async run(args, ctx) {
    if (!ctx.practice) {
      return { error: 'No practice exercise is loaded for this concept.' };
    }
    const outcome = args['outcome'] as QuestionOutcome | undefined;
    const result = await ctx.practice.next(outcome);
    ctx.session.questionProgress = ctx.practice.progress;

    if (result.done) {
      const { total, passed, failed } = result.summary;
      return {
        done: true,
        message: `Practice complete. ${passed}/${total} correct.`,
        summary: { total, passed, failed },
      };
    }

    let question = result.question;
    if (ctx.journeyNode.state === CS.NOT_ASSESSED || ctx.journeyNode.state === CS.ASSESSING) {
      const { hints, stepsToSolve, writingHint, ...assessmentQuestion } = question;
      question = assessmentQuestion;
    }

    return {
      done: false,
      index: result.index,
      total: result.total,
      question,
      reminder: [
        'Follow the practice loop. Do always evaluate the step child is at, against the stepsToSolve. Dont invent your steps'].join("\n")
    };
  },
};
