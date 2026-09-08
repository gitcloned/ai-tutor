/**
 * Teaching plan — navigation tests
 *
 * Run with (after build):
 *   node --test dist/tests/plan-builder.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compileProbingTree } from '../src/plan-builder.js';
import { get_next_step, update_step } from '../src/tools/plan.js';

// ── Fixture ────────────────────────────────────────────────────────────────────
//
// A simple two-probe tree:
//
//   probe1 (x or y?)
//     pass → probe2 (what does x equal?)
//     fail → teach (ordered pairs) → probe2
//
//   probe2
//     pass → store_memory → advance_state
//     fail → store_memory → advance_state

const simpleTree = {
  nodes: [
    {
      probe:       'Does -2 represent x or y?',
      idealAnswer: 'y',
      ifCorrect: {
        type: 'steps',
        steps: [
          {
            probe:       'What does x equal?',
            idealAnswer: '-25',
            ifCorrect: { type: 'question' },
            ifWrong:   { type: 'question' },
          },
        ],
      },
      ifWrong: {
        type:      'teach',
        conceptId: 'ordered-pairs',
        title:     'Ordered Pairs',
        thenAsk: {
          probe:       'What does x equal?',
          idealAnswer: '-25',
          ifCorrect: { type: 'question' },
          ifWrong:   { type: 'question' },
        },
      },
    },
  ],
};

function makeCtx(plan: ReturnType<typeof compileProbingTree>) {
  return { plan } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Teaching plan — navigation', () => {

  describe('when we ask what the current step is', () => {
    test('then get_next_step returns the first probe', async () => {
      const plan = compileProbingTree(simpleTree);
      const result = await get_next_step.run({}, makeCtx(plan)) as any;

      assert.ok(result.step, 'should return a step');
      assert.equal(result.step.type, 'probe');
      assert.equal(result.step.content.question, 'Does -2 represent x or y?');
    });
  });

  describe('when student passes the first probe', () => {
    test('then tool returns the next probe on the correct path', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;

      const result = await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan)) as any;

      assert.ok(result.nextStep, 'should return a next step');
      assert.equal(result.nextStep.type, 'probe');
      assert.equal(result.nextStep.content.question, 'What does x equal?');
    });

    test('then the completed step is marked with outcome pass', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;

      await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan));

      assert.equal(first.outcome, 'pass');
      assert.equal(first.status, 'done');
    });
  });

  describe('when student fails the first probe', () => {
    test('then tool returns a teach step on the wrong path', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;

      const result = await update_step.run({ id: first.id, outcome: 'fail' }, makeCtx(plan)) as any;

      assert.ok(result.nextStep, 'should return a next step');
      assert.equal(result.nextStep.type, 'teach');
      assert.equal(result.nextStep.content.conceptId, 'ordered-pairs');
    });

    test('then the completed step is marked with outcome fail', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;

      await update_step.run({ id: first.id, outcome: 'fail' }, makeCtx(plan));

      assert.equal(first.outcome, 'fail');
    });
  });

  describe('when student is not sure on a probe', () => {
    test('then tool treats it the same as a pass and moves forward', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;
      const expectedNextId = first.ifCorrect;

      const result = await update_step.run({ id: first.id, outcome: 'not_sure' }, makeCtx(plan)) as any;

      assert.ok(result.nextStep);
      assert.equal(result.nextStep.id, expectedNextId);
    });
  });

  describe('when student completes the last step in the plan', () => {
    test('then tool returns done with no next step', async () => {
      const plan = compileProbingTree(simpleTree);
      const advance = plan.find(s => s.type === 'advance_state')!;
      advance.status = 'in_progress';

      const result = await update_step.run({ id: advance.id, outcome: 'pass' }, makeCtx(plan)) as any;

      assert.ok(result.allDone, 'should signal all done');
      assert.ok(!result.nextStep, 'should have no next step');
    });
  });

  describe('when a step is completed and there is a next step', () => {
    test('then tool returns a reminder to follow the plan', async () => {
      const plan = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;

      const result = await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan)) as any;

      assert.ok(result.reminder, 'should include a reminder');
    });
  });

  describe('when student passes then fails across two probes', () => {
    test('then each step records its own outcome', async () => {
      const plan = compileProbingTree(simpleTree);
      const ctx  = makeCtx(plan);

      const first = plan.find(s => s.status === 'in_progress')!;
      await update_step.run({ id: first.id, outcome: 'pass' }, ctx);
      assert.equal(first.outcome, 'pass');

      const second = plan.find(s => s.status === 'in_progress')!;
      await update_step.run({ id: second.id, outcome: 'fail' }, ctx);
      assert.equal(second.outcome, 'fail');
    });
  });

});
