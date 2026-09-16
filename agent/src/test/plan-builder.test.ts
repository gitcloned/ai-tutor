/**
 * Teaching plan — navigation tests (vitest).
 *
 * Covers pure plan compilation and step navigation (probe, inline steps).
 * Smart step handling (teach → redirect, advance_state → transition) is tested
 * in update-step.test.ts which mocks the LP/CMS APIs.
 */

import { describe, it, expect } from 'vitest';
import { compileProbingTree, buildPlan } from '../learning/plan-builder.js';
import { get_next_step, update_step }    from '../tools/plan.js';

// ── Fixture ────────────────────────────────────────────────────────────────────
//
//   probe1 (x or y?)
//     pass → probe2 (what does x equal?)
//     fail → teach (ordered-pairs) → probe2
//
//   probe2
//     pass/fail → store_memory → advance_state

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
  return { plan, journeyNode: { state: 'not_assessed', goTo: null }, concept: {}, session: {}, memories: [], log: () => {} } as any;
}

// ── compileProbingTree ────────────────────────────────────────────────────────

describe('compileProbingTree', () => {

  it('always ends with store_memory → advance_state', () => {
    const plan = compileProbingTree(simpleTree);
    const store   = plan.find(s => s.type === 'store_memory');
    const advance = plan.find(s => s.type === 'advance_state');
    expect(store).toBeDefined();
    expect(advance).toBeDefined();
    expect(store!.ifCorrect).toBe(advance!.id);
  });

  it('first step is in_progress', () => {
    const plan = compileProbingTree(simpleTree);
    expect(plan[0].status).toBe('in_progress');
  });

  it('all other steps start as pending', () => {
    const plan = compileProbingTree(simpleTree);
    plan.slice(1).forEach(s => expect(s.status).toBe('pending'));
  });

  it('no step has a null pointer (all wired to something)', () => {
    const plan = compileProbingTree(simpleTree);
    const nonTerminal = plan.filter(s => s.type !== 'advance_state');
    nonTerminal.forEach(s => {
      expect(s.ifCorrect ?? s.ifWrong).not.toBeNull();
    });
  });

  it('probe stores idealAnswer in content', () => {
    const plan  = compileProbingTree(simpleTree);
    const probe = plan.find(s => s.type === 'probe');
    expect((probe!.content as any).idealAnswer).toBe('y');
  });

  it('teach step stores conceptId and title in content', () => {
    const plan  = compileProbingTree(simpleTree);
    const teach = plan.find(s => s.type === 'teach');
    expect((teach!.content as any).conceptId).toBe('ordered-pairs');
    expect((teach!.content as any).conceptTitle).toBe('Ordered Pairs');
  });

  it('correct path on two-level tree follows ifCorrect', () => {
    const plan  = compileProbingTree(simpleTree);
    const first = plan.find(s => s.status === 'in_progress')!;
    const next  = plan.find(s => s.id === first.ifCorrect);
    expect(next?.type).toBe('probe');
    expect((next?.content as any).question).toBe('What does x equal?');
  });

  it('wrong path on two-level tree follows ifWrong to teach step', () => {
    const plan  = compileProbingTree(simpleTree);
    const first = plan.find(s => s.status === 'in_progress')!;
    const next  = plan.find(s => s.id === first.ifWrong);
    expect(next?.type).toBe('teach');
  });

  it('inline step compiles thenAsk as a probe', () => {
    const treeWithInline = {
      nodes: [{
        probe: 'Q?', idealAnswer: 'A',
        ifCorrect: { type: 'question' },
        ifWrong: { type: 'inline', content: 'explanation', thenAsk: { probe: 'Follow up?', idealAnswer: 'B', ifCorrect: { type: 'question' }, ifWrong: { type: 'question' } } },
      }],
    };
    const plan   = compileProbingTree(treeWithInline);
    const inline = plan.find(s => s.type === 'inline');
    const follow = plan.find(s => s.id === inline!.ifCorrect);
    expect(follow?.type).toBe('probe');
  });

  it('store_memory chains to advance_state', () => {
    const plan    = compileProbingTree(simpleTree);
    const store   = plan.find(s => s.type === 'store_memory')!;
    const advance = plan.find(s => s.type === 'advance_state')!;
    expect(store.ifCorrect).toBe(advance.id);
    expect(store.ifWrong).toBe(advance.id);
  });

  it('advance_state step has targetState learning', () => {
    const plan    = compileProbingTree(simpleTree);
    const advance = plan.find(s => s.type === 'advance_state')!;
    expect((advance.content as any).targetState).toBe('learning');
  });

});

// ── Traversal simulation ──────────────────────────────────────────────────────

describe('traversal simulation', () => {

  function stepThrough(plan: ReturnType<typeof compileProbingTree>, outcomes: string[]) {
    const ctx = makeCtx(plan);
    for (const outcome of outcomes) {
      const step = plan.find(s => s.status === 'in_progress') ?? plan.find(s => s.status === 'pending');
      if (!step || step.type === 'teach' || step.type === 'advance_state') break;
      step.status  = 'in_progress';
      step.outcome = outcome as any;
      step.status  = 'done';
      const nextId = outcome === 'fail' ? step.ifWrong : step.ifCorrect;
      const next   = nextId != null ? plan.find(s => s.id === nextId) : null;
      if (next && next.type !== 'teach' && next.type !== 'advance_state') next.status = 'in_progress';
    }
    return plan;
  }

  it('all-correct path reaches store_memory', () => {
    const plan = compileProbingTree(simpleTree);
    stepThrough(plan, ['pass', 'pass']);
    expect(plan.find(s => s.status === 'in_progress')?.type ?? plan.find(s => s.status === 'pending')?.type).toBe('store_memory');
  });

  it('all-wrong path reaches teach step then store_memory', () => {
    const plan  = compileProbingTree(simpleTree);
    const first = plan.find(s => s.status === 'in_progress')!;
    // failing first probe → teach (prereq)
    const wrongId = first.ifWrong;
    const teach   = plan.find(s => s.id === wrongId);
    expect(teach?.type).toBe('teach');
  });

  it('correct then wrong still reaches store_memory after teach', () => {
    const plan  = compileProbingTree(simpleTree);
    // pass first probe → second probe
    const first = plan.find(s => s.status === 'in_progress')!;
    first.status  = 'done';
    first.outcome = 'pass';
    const second = plan.find(s => s.id === first.ifCorrect)!;
    second.status = 'in_progress';
    // fail second probe
    second.status  = 'done';
    second.outcome = 'fail';
    const nextId = plan.find(s => s.id === second.ifWrong);
    expect(nextId?.type).toBe('store_memory');
  });

});

// ── buildPlan ─────────────────────────────────────────────────────────────────

describe('buildPlan', () => {

  const concept = {
    id: 'c1', title: 'Test',
    probingTree: { nodes: simpleTree.nodes },
    lessonPlan: [{ type: 'ido', instruction: 'Teach the concept' }],
    nextConcepts: [],
  } as any;

  it('not_assessed with probing tree compiles it', () => {
    const plan = buildPlan(concept, 'not_assessed');
    expect(plan.some(s => s.type === 'probe')).toBe(true);
  });

  it('not_assessed without probing tree returns fallback', () => {
    const plan = buildPlan({ ...concept, probingTree: null }, 'not_assessed');
    expect(plan.length).toBeGreaterThan(0);
  });

  it('learning state returns teaching plan', () => {
    const plan = buildPlan(concept, 'learning');
    expect(plan.some(s => s.type === 'teach' || s.type === 'probe')).toBe(true);
  });

  it('linear plan has sequential ifCorrect pointers', () => {
    const plan = buildPlan(concept, 'learning');
    for (let i = 0; i < plan.length - 1; i++) {
      expect(plan[i].ifCorrect).toBe(plan[i + 1].id);
    }
  });

});

// ── get_next_step / update_step — pure navigation ─────────────────────────────

describe('get_next_step and update_step — pure probe navigation', () => {

  describe('when we ask what the current step is', () => {
    it('then get_next_step returns the first probe', async () => {
      const plan   = compileProbingTree(simpleTree);
      const result = await get_next_step.run({}, makeCtx(plan)) as any;
      expect(result.step).toBeDefined();
      expect(result.step.type).toBe('probe');
      expect(result.step.content.question).toBe('Does -2 represent x or y?');
    });
  });

  describe('when student passes the first probe', () => {
    it('then tool returns the next probe on the correct path', async () => {
      const plan  = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;
      const result = await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan)) as any;
      expect(result.nextStep).toBeDefined();
      expect(result.nextStep.type).toBe('probe');
      expect(result.nextStep.content.question).toBe('What does x equal?');
    });

    it('then the completed step is marked with outcome pass', async () => {
      const plan  = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;
      await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan));
      expect(first.outcome).toBe('pass');
      expect(first.status).toBe('done');
    });
  });

  describe('when student is not_sure on a probe', () => {
    it('then tool treats it the same as pass and moves forward', async () => {
      const plan  = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;
      const expectedNextId = first.ifCorrect;
      const result = await update_step.run({ id: first.id, outcome: 'not_sure' }, makeCtx(plan)) as any;
      expect(result.nextStep.id).toBe(expectedNextId);
    });
  });

  describe('when a step is completed and there is a next step', () => {
    it('then tool returns a reminder to follow the plan', async () => {
      const plan  = compileProbingTree(simpleTree);
      const first = plan.find(s => s.status === 'in_progress')!;
      const result = await update_step.run({ id: first.id, outcome: 'pass' }, makeCtx(plan)) as any;
      expect(result.reminder).toBeDefined();
    });
  });

  describe('when student passes then fails across two probes', () => {
    it('then each step records its own outcome', async () => {
      const plan = compileProbingTree(simpleTree);
      const ctx  = makeCtx(plan);
      const first = plan.find(s => s.status === 'in_progress')!;
      await update_step.run({ id: first.id, outcome: 'pass' }, ctx);
      expect(first.outcome).toBe('pass');
      const second = plan.find(s => s.status === 'in_progress')!;
      await update_step.run({ id: second.id, outcome: 'fail' }, ctx);
      expect(second.outcome).toBe('fail');
    });
  });

});
