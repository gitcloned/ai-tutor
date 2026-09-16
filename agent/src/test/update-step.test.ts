/**
 * Learning plan — navigation and state-transition tests (vitest).
 *
 * The learning plan is compiled from the concept's lessonPlan (ido/wedo/youdo steps).
 * For each step: resource (video) → practice (question). Ends with advance_state → clarity.
 *
 * Prereq redirect and return-to-origin are tested in redirect.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONCEPT_COMPLETING_SOLUTIONS, makeNode, makeCtx } from './fixtures.js';
import { buildPlan } from '../learning/plan-builder.js';
import { get_next_step, update_step } from '../tools/plan.js';

// ── Mock API clients ──────────────────────────────────────────────────────────

vi.mock('../api.js', () => ({
  lp:  { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  cms: { get: vi.fn() },
}));

import { lp } from '../api.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

// CONCEPT_COMPLETING_SOLUTIONS.lessonPlan has:
//   ido  → resource (video) + practice (learning indicator text, no assessmentQuestion)
//   youdo → teach (no video) + practice (assessmentQuestion: "If y=3, what is x?")
// → expected plan: resource, practice, teach, practice, advance_state

function makeLearningCtx() {
  const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
  return makeCtx({
    concept:     CONCEPT_COMPLETING_SOLUTIONS,
    journeyNode: makeNode({ state: 'learning', goTo: null }),
    plan,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('buildPlan — learning state', () => {

  it('produces a resource step for the ido lesson step that has a video', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    const resource = plan.find(s => s.type === 'resource');
    expect(resource).toBeDefined();
    expect((resource!.content as any).lessonType).toBe('ido');
    expect((resource!.content as any).resources[0].youtubeUrl).toContain('youtube.com');
  });

  it('produces a practice step after each resource step', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    const resourceIdx = plan.findIndex(s => s.type === 'resource');
    expect(plan[resourceIdx + 1]?.type).toBe('practice');
  });

  it('uses the assessmentQuestion stem as the question when available', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    // Second lesson step (youdo) has an assessmentQuestion with a stem
    const practices = plan.filter(s => s.type === 'practice');
    const withQId = practices.find(s => (s.content as any).questionId === 'q-completing-1');
    expect(withQId).toBeDefined();
    expect((withQId!.content as any).question).toBe('If y = 3, what is x in the equation x - 5y = -15?');
  });

  it('falls back to learningIndicator text when there is no assessmentQuestion', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    const practices = plan.filter(s => s.type === 'practice');
    const withoutQId = practices.find(s => !(s.content as any).questionId);
    expect((withoutQId!.content as any).question).toBe(
      'Student can substitute a given value and solve for the unknown variable',
    );
  });

  it('ends with advance_state targeting "clarity"', () => {
    const plan    = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    const advance = plan[plan.length - 1];
    expect(advance.type).toBe('advance_state');
    expect((advance.content as any).targetState).toBe('clarity');
  });

  it('steps are wired linearly — each step\'s ifCorrect points to the next', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    for (let i = 0; i < plan.length - 1; i++) {
      expect(plan[i].ifCorrect).toBe(plan[i + 1].id);
    }
  });

  it('first step is in_progress, all others pending', () => {
    const plan = buildPlan(CONCEPT_COMPLETING_SOLUTIONS, 'learning');
    expect(plan[0].status).toBe('in_progress');
    plan.slice(1).forEach(s => expect(s.status).toBe('pending'));
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_next_step — learning plan', () => {

  describe('when the session starts', () => {
    it('returns the first step — a resource step for the ido video', async () => {
      const ctx    = makeLearningCtx();
      const result = await get_next_step.run({}, ctx) as any;
      expect(result.step).toBeDefined();
      expect(result.step.type).toBe('resource');
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('update_step — navigating the learning plan', () => {

  beforeEach(() => vi.clearAllMocks());

  describe('when the agent completes the resource step (student finished watching)', () => {
    it('moves to the practice question for that lesson step', async () => {
      const ctx      = makeLearningCtx();
      const resource = ctx.plan.find(s => s.type === 'resource')!;

      const result = await update_step.run({ id: resource.id, outcome: 'done' }, ctx) as any;

      expect(result.ok).toBe(true);
      expect(result.nextStep.type).toBe('practice');
    });

    it('marks the resource step done', async () => {
      const ctx      = makeLearningCtx();
      const resource = ctx.plan.find(s => s.type === 'resource')!;

      await update_step.run({ id: resource.id, outcome: 'done' }, ctx);

      expect(resource.status).toBe('done');
    });
  });

  describe('when the student answers a practice question correctly', () => {
    it('moves to the next lesson step', async () => {
      const ctx      = makeLearningCtx();
      const resource = ctx.plan.find(s => s.type === 'resource')!;
      await update_step.run({ id: resource.id, outcome: 'done' }, ctx);

      const practice = ctx.plan.find(s => s.type === 'practice' && s.status === 'in_progress')!;
      const result   = await update_step.run({ id: practice.id, outcome: 'pass' }, ctx) as any;

      expect(result.ok).toBe(true);
      expect(result.nextStep).toBeDefined();
      expect(result.nextStep.id).toBe(practice.ifCorrect);
    });
  });

  describe('when the student answers a practice question incorrectly', () => {
    it('still moves to the next step — the plan is linear, not branching', async () => {
      const ctx      = makeLearningCtx();
      const resource = ctx.plan.find(s => s.type === 'resource')!;
      await update_step.run({ id: resource.id, outcome: 'done' }, ctx);

      const practice = ctx.plan.find(s => s.type === 'practice' && s.status === 'in_progress')!;
      const result   = await update_step.run({ id: practice.id, outcome: 'fail' }, ctx) as any;

      // linear: ifWrong === ifCorrect
      expect(result.nextStep.id).toBe(practice.ifWrong);
      expect(practice.ifWrong).toBe(practice.ifCorrect);
    });
  });

  describe('when the agent completes the advance_state step', () => {

    it('transitions ctx.journeyNode.state to "clarity"', async () => {
      const ctx         = makeLearningCtx();
      const advanceStep = ctx.plan.find(s => s.type === 'advance_state')!;
      vi.mocked(lp.patch).mockResolvedValue({});

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(ctx.journeyNode.state).toBe('clarity');
    });

    it('patches the journey node in LP with state "clarity"', async () => {
      const ctx         = makeLearningCtx();
      const advanceStep = ctx.plan.find(s => s.type === 'advance_state')!;
      vi.mocked(lp.patch).mockResolvedValue({});

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(lp.patch).toHaveBeenCalledWith(
        `/journey-nodes/${ctx.journeyNode.id}`,
        expect.objectContaining({ state: 'clarity' }),
      );
    });

    it('leaves ctx.plan empty — clarity plan is not yet implemented', async () => {
      const ctx         = makeLearningCtx();
      const advanceStep = ctx.plan.find(s => s.type === 'advance_state')!;
      vi.mocked(lp.patch).mockResolvedValue({});

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      // clarity is unimplemented — plan builder throws → caught → plan is empty
      expect(ctx.plan.length).toBe(0);
    });

    it('returns allDone since the clarity plan is not yet implemented', async () => {
      const ctx         = makeLearningCtx();
      const advanceStep = ctx.plan.find(s => s.type === 'advance_state')!;
      vi.mocked(lp.patch).mockResolvedValue({});

      const result = await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx) as any;

      expect(result.ok).toBe(true);
      // node state still transitions correctly
      expect(ctx.journeyNode.state).toBe('clarity');
      // no next step — session ends gracefully
      expect(result.allDone).toBe(true);
    });

    it('does not trigger return-to-origin — goTo is null on this node', async () => {
      const ctx         = makeLearningCtx();
      const advanceStep = ctx.plan.find(s => s.type === 'advance_state')!;
      vi.mocked(lp.patch).mockResolvedValue({});

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(lp.get).not.toHaveBeenCalled();
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('full walk — resource → practice → advance_state', () => {
    it('can complete all steps in sequence; node state advances to "clarity" and session ends gracefully', async () => {
      const ctx = makeLearningCtx();
      vi.mocked(lp.patch).mockResolvedValue({});

      let lastResult: any;
      let guard = 20;
      while (guard-- > 0) {
        const step = ctx.plan.find(s => s.status === 'in_progress')
                  ?? ctx.plan.find(s => s.status === 'pending');
        if (!step) break;

        step.status   = 'in_progress';
        const outcome = step.type === 'advance_state' ? 'done'
                      : step.type === 'resource'      ? 'done'
                      : 'pass';
        lastResult = await update_step.run({ id: step.id, outcome }, ctx) as any;

        if (lastResult.allDone) break;
      }

      // node transitions to clarity even though its plan isn't built yet
      expect(ctx.journeyNode.state).toBe('clarity');
      // session ends gracefully rather than erroring
      expect(lastResult.allDone).toBe(true);
    });
  });

});
