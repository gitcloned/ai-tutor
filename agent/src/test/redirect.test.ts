/**
 * Prereq redirect and return-to-origin — tested via update_step.
 *
 * These behaviors are not exposed as tools. They are absorbed into update_step:
 *   - When the next step is teach-type → redirect to prereq happens automatically.
 *   - When advance_state completes on a prereq node (goTo set) → return to origin
 *     happens automatically.
 *
 * Real concept fixtures from the DB:
 *   graphing-solutions-to-2-variable-linear-equations-1  (Completing solutions)
 *   checking-ordered-pair-solutions-to-equations-1        (Solutions to 2-variable equations)
 *   2-variable-linear-equations-graphs                    (Two-variable linear equations intro)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CONCEPT_COMPLETING_SOLUTIONS,
  CONCEPT_ORDERED_PAIRS,
  CONCEPT_TWO_VAR_INTRO,
  makeNode,
  makeSession,
  makeCtx,
} from './fixtures.js';
import { compileProbingTree } from '../learning/plan-builder.js';
import { update_step } from '../tools/plan.js';

// ── Mock API clients ──────────────────────────────────────────────────────────

vi.mock('../api.js', () => ({
  lp:  { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  cms: { get: vi.fn() },
}));

import { lp, cms } from '../api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compile a minimal probing plan where failing the probe leads directly to a
 * teach step for the given prereq concept.
 */
function planWithTeach(prereqConceptId: string, prereqConceptTitle: string) {
  return compileProbingTree({
    nodes: [{
      probe:       'What does -2 represent in the ordered pair?',
      idealAnswer: 'y',
      ifCorrect:   { type: 'question' },
      ifWrong: {
        type:      'teach',
        conceptId: prereqConceptId,
        title:     prereqConceptTitle,
      },
    }],
  });
}

/**
 * Compile a minimal probing plan with no special branches.
 * Used when we only need an advance_state step to test return-to-origin.
 */
function plainProbingPlan() {
  return compileProbingTree({
    nodes: [{
      probe:       'A simple question',
      idealAnswer: 'A',
      ifCorrect:   { type: 'question' },
      ifWrong:     { type: 'question' },
    }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('prereq redirect — triggered by update_step when next step is teach-type', () => {

  beforeEach(() => vi.clearAllMocks());

  describe('when the student fails a probe whose wrong path leads to "Solutions to 2-variable equations"', () => {

    function setup() {
      const plan  = planWithTeach(CONCEPT_ORDERED_PAIRS.id, CONCEPT_ORDERED_PAIRS.title);
      const probe = plan.find(s => s.type === 'probe')!;
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing', state: 'not_assessed' }),
        plan,
      });
      return { probe, ctx };
    }

    it('then the current node is patched to learn-pre-req-before with preReqToLearn set', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(lp.patch).toHaveBeenCalledWith(
        '/journey-nodes/node-completing',
        expect.objectContaining({
          state:         'learn-pre-req-before',
          preReqToLearn: CONCEPT_ORDERED_PAIRS.id,
        }),
      );
    });

    it('then a new journey node is created for the prereq with goTo and cameFrom pointing to the origin', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(lp.post).toHaveBeenCalledWith(
        '/journey-nodes',
        expect.objectContaining({
          conceptId: CONCEPT_ORDERED_PAIRS.id,
          goTo:      CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom:  CONCEPT_COMPLETING_SOLUTIONS.id,
          state:     'learning',
        }),
      );
    });

    it('then ctx is swapped to the prereq concept and node', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(ctx.concept.id).toBe(CONCEPT_ORDERED_PAIRS.id);
      expect(ctx.journeyNode.conceptId).toBe(CONCEPT_ORDERED_PAIRS.id);
    });

    it('then update_step returns the first step of the prereq plan so the agent can deliver it in the same turn', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      const result = await update_step.run({ id: probe.id, outcome: 'fail' }, ctx) as any;

      expect(result.ok).toBe(true);
      // nextStep lets the agent deliver the prereq content inline in the same turn
      expect(result.nextStep).toBeDefined();
      expect(result.nextStep.id).toBe('1');
      expect(result.message).toContain(CONCEPT_ORDERED_PAIRS.title);
      // send-ok is the safety net: auto-triggers the next turn so the prereq
      // content plays even if the agent skips nextStep
      expect(result.action).toEqual({ type: 'send-ok' });
    });

    it('then a planHistory entry is seeded on the new prereq session', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      // ctx.session is now the prereq session — it has one planHistory entry
      expect(ctx.session.planHistory).toHaveLength(1);
      expect(ctx.session.planHistory[0].conceptId).toBe(CONCEPT_ORDERED_PAIRS.id);
    });

    it('then teachingPlan.content is updated to name the active prereq and the origin', async () => {
      const { probe, ctx } = setup();

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(ctx.session.teachingPlan.content).toContain(CONCEPT_ORDERED_PAIRS.title);
      expect(ctx.session.teachingPlan.content).toContain(CONCEPT_COMPLETING_SOLUTIONS.title);
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when the student needs the "Two-variable linear equations intro" prereq instead', () => {
    it('then the new prereq node points goTo back to completing-solutions', async () => {
      const plan  = planWithTeach(CONCEPT_TWO_VAR_INTRO.id, CONCEPT_TWO_VAR_INTRO.title);
      const probe = plan.find(s => s.type === 'probe')!;
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing' }),
        plan,
      });

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-two-var', journeyId: 'journey-1',
        conceptId: CONCEPT_TWO_VAR_INTRO.id, state: 'learning',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_TWO_VAR_INTRO);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(lp.post).toHaveBeenCalledWith(
        '/journey-nodes',
        expect.objectContaining({
          conceptId: CONCEPT_TWO_VAR_INTRO.id,
          goTo:      CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom:  CONCEPT_COMPLETING_SOLUTIONS.id,
        }),
      );
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when a prereq journey node already exists for this student', () => {
    it('then update_step reuses it and patches goTo/cameFrom — does not create a duplicate', async () => {
      const plan  = planWithTeach(CONCEPT_ORDERED_PAIRS.id, CONCEPT_ORDERED_PAIRS.title);
      const probe = plan.find(s => s.type === 'probe')!;
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing' }),
        plan,
      });

      const existingNode = {
        id: 'node-ordered-pairs-existing', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'not_assessed',
        goTo: null, cameFrom: null, preReqToLearn: null,
      };
      vi.mocked(lp.get).mockResolvedValueOnce([existingNode]);
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(lp.post).not.toHaveBeenCalledWith('/journey-nodes', expect.anything());
      expect(lp.patch).toHaveBeenCalledWith(
        `/journey-nodes/${existingNode.id}`,
        expect.objectContaining({
          goTo:     CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id,
        }),
      );
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('return to origin — triggered by update_step when advance_state completes on a prereq node', () => {

  beforeEach(() => vi.clearAllMocks());

  describe('when the prereq plan finishes and goTo is set on the current node', () => {

    function setup() {
      const plan        = plainProbingPlan();
      const advanceStep = plan.find(s => s.type === 'redirect' && !(s.content as any).conceptId)!;
      const ctx         = makeCtx({
        concept: CONCEPT_ORDERED_PAIRS,
        journeyNode: makeNode({
          id:        'node-ordered-pairs',
          conceptId: CONCEPT_ORDERED_PAIRS.id,
          state:     'learning',
          goTo:      CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom:  CONCEPT_COMPLETING_SOLUTIONS.id,
        }),
        plan,
      });
      return { advanceStep, ctx };
    }

    function mockReturnToOrigin() {
      vi.mocked(lp.patch).mockResolvedValue({});
      // First lp.get: origin journey node
      vi.mocked(lp.get).mockResolvedValueOnce([{
        id: 'node-completing', journeyId: 'journey-1',
        conceptId: CONCEPT_COMPLETING_SOLUTIONS.id,
        state: 'learn-pre-req-before', goTo: null, cameFrom: null,
        preReqToLearn: CONCEPT_ORDERED_PAIRS.id,
      }]);
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_COMPLETING_SOLUTIONS);
      // Second lp.get: origin session (found by studentId + conceptId + status=started)
      vi.mocked(lp.get).mockResolvedValueOnce([makeSession({ status: 'started', planHistory: [] })]);
    }

    it('then ctx is swapped back to the origin concept and node', async () => {
      const { advanceStep, ctx } = setup();
      mockReturnToOrigin();

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(ctx.concept.id).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
      expect(ctx.journeyNode.conceptId).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
    });

    it('then the origin node is patched to state "learning" and preReqToLearn cleared', async () => {
      const { advanceStep, ctx } = setup();
      mockReturnToOrigin();

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(lp.patch).toHaveBeenCalledWith(
        '/journey-nodes/node-completing',
        expect.objectContaining({ state: 'learning', preReqToLearn: null }),
      );
    });

    it('then update_step returns the first step of the origin learning plan', async () => {
      const { advanceStep, ctx } = setup();
      mockReturnToOrigin();

      const result = await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx) as any;

      expect(result.ok).toBe(true);
      expect(result.nextStep).toBeDefined();
      expect(result.concept).toBe(CONCEPT_COMPLETING_SOLUTIONS.title);
    });

    it('then a planHistory entry is appended to the origin session on return', async () => {
      const { advanceStep, ctx } = setup();
      // mockReturnToOrigin provides origin session with 1 existing entry;
      // returnToOrigin appends a second (resumed) entry → 2 total on origin session
      mockReturnToOrigin();

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      // ctx.session is now the origin session (swapped by returnToOrigin)
      expect(ctx.session.planHistory).toHaveLength(1); // origin session had [] + 1 appended
      expect(ctx.session.planHistory[0].conceptId).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
    });

    it('then teachingPlan.content is updated to reflect the return', async () => {
      const { advanceStep, ctx } = setup();
      mockReturnToOrigin();

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(ctx.session.teachingPlan.content).toContain(CONCEPT_COMPLETING_SOLUTIONS.title);
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when goTo is not set — the node is not a prereq node', () => {
    it('then the plan is rebuilt for the new state and ctx stays on the same concept', async () => {
      const plan        = plainProbingPlan();
      const advanceStep = plan.find(s => s.type === 'redirect' && !(s.content as any).conceptId)!;
      const ctx         = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing', goTo: null }),
        plan,
      });

      vi.mocked(lp.patch).mockResolvedValue({});

      const result = await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx) as any;

      expect(result.ok).toBe(true);
      expect(ctx.concept.id).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
      expect(result.concept).toBe(CONCEPT_COMPLETING_SOLUTIONS.title);
      // returnToOrigin was never reached — lp.get was not called
      expect(lp.get).not.toHaveBeenCalled();
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('chained prereq — two hops deep', () => {
    it('then update_step returns to the immediate goTo (two-var-intro), not all the way to completing-solutions', async () => {
      // Stack: completing-solutions → two-var-intro → ordered-pairs
      // ordered-pairs advance_state fires → should return to two-var-intro only
      const plan        = plainProbingPlan();
      const advanceStep = plan.find(s => s.type === 'redirect' && !(s.content as any).conceptId)!;
      const ctx         = makeCtx({
        concept: CONCEPT_ORDERED_PAIRS,
        journeyNode: makeNode({
          id:        'node-ordered-pairs',
          conceptId: CONCEPT_ORDERED_PAIRS.id,
          state:     'assessing',  // transition state — advance_state triggers go-to-origin
          goTo:      CONCEPT_TWO_VAR_INTRO.id,    // immediate origin is two-var-intro
          cameFrom:  CONCEPT_TWO_VAR_INTRO.id,
        }),
        plan,
      });

      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(lp.get).mockResolvedValueOnce([{
        id: 'node-two-var', journeyId: 'journey-1',
        conceptId: CONCEPT_TWO_VAR_INTRO.id,
        state: 'learn-pre-req-before',
        goTo:  CONCEPT_COMPLETING_SOLUTIONS.id,
        cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id,
        preReqToLearn: CONCEPT_ORDERED_PAIRS.id,
      }]);
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_TWO_VAR_INTRO);
      vi.mocked(lp.get).mockResolvedValueOnce([makeSession({ status: 'started', conceptId: CONCEPT_TWO_VAR_INTRO.id })]);

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      // Swapped to two-var-intro — not all the way back to completing-solutions
      expect(ctx.concept.id).toBe(CONCEPT_TWO_VAR_INTRO.id);
      expect(ctx.journeyNode.conceptId).toBe(CONCEPT_TWO_VAR_INTRO.id);
    });
  });

});
