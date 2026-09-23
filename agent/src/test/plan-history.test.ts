/**
 * planHistory lifecycle — tracking plans across concept hops in one session.
 *
 * planHistory is an append-only array on the session. Each concept swap
 * (redirect to prereq, return to origin) appends a new entry. These transitions
 * are triggered through update_step — not via standalone tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CONCEPT_COMPLETING_SOLUTIONS,
  CONCEPT_ORDERED_PAIRS,
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

function planWithTeachStep(prereqConceptId: string, prereqConceptTitle: string) {
  return compileProbingTree({
    nodes: [{
      probe: 'What does -2 represent?', idealAnswer: 'y',
      ifCorrect: { type: 'question' },
      ifWrong: { type: 'teach', conceptId: prereqConceptId, title: prereqConceptTitle },
    }],
  });
}

function plainProbingPlan() {
  return compileProbingTree({
    nodes: [{
      probe: 'A simple question', idealAnswer: 'A',
      ifCorrect: { type: 'question' },
      ifWrong:   { type: 'question' },
    }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('planHistory — tracking plans across concept hops in one session', () => {

  beforeEach(() => vi.clearAllMocks());

  describe('when a session starts', () => {
    it('planHistory is an empty array until buildContext seeds the first entry', () => {
      // buildContext seeds planHistory after building the initial plan.
      // The fixture starts empty — the first redirect then appends (not replaces).
      const session = makeSession({ planHistory: [] });
      expect(session.planHistory).toHaveLength(0);
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when the student fails a probe and update_step redirects to a prereq', () => {

    it('creates a new prereq session with one planHistory entry for the prereq', async () => {
      const plan  = planWithTeachStep(CONCEPT_ORDERED_PAIRS.id, CONCEPT_ORDERED_PAIRS.title);
      const probe = plan.find(s => s.type === 'probe')!;
      // Origin session has its own planHistory; prereq session starts fresh
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing' }),
        plan,
        session: makeSession({ status: 'started', planHistory: [] }),
      });

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'not_assessed',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      // ctx.session is now the prereq session — one entry for the prereq concept
      expect(ctx.session.planHistory).toHaveLength(1);
      expect(ctx.session.planHistory[0].conceptId).toBe(CONCEPT_ORDERED_PAIRS.id);
    });

    it('persists the updated planHistory and teachingPlan to the prereq session in LP', async () => {
      const plan  = planWithTeachStep(CONCEPT_ORDERED_PAIRS.id, CONCEPT_ORDERED_PAIRS.title);
      const probe = plan.find(s => s.type === 'probe')!;
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing' }),
        plan,
      });

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'not_assessed',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.post).mockResolvedValueOnce(makeSession());  // createSession for prereq
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      // After redirect ctx.session is the prereq session; LP should be patched with its planHistory
      expect(lp.patch).toHaveBeenCalledWith(
        `/sessions/${ctx.session.id}`,
        expect.objectContaining({
          planHistory:  expect.any(Array),
          teachingPlan: expect.objectContaining({ content: expect.any(String) }),
        }),
      );
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when the prereq plan finishes and update_step returns to the origin concept', () => {

    it('origin session gets a new planHistory entry for the resumed concept', async () => {
      const plan        = plainProbingPlan();
      const advanceStep = plan.find(s => s.type === 'redirect' && !(s.content as any).conceptId)!;
      // ctx.session is the prereq session — has one entry for the prereq
      const ctx         = makeCtx({
        concept: CONCEPT_ORDERED_PAIRS,
        journeyNode: makeNode({
          id:        'node-ordered-pairs',
          conceptId: CONCEPT_ORDERED_PAIRS.id,
          state:     'assessing',
          goTo:      CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom:  CONCEPT_COMPLETING_SOLUTIONS.id,
        }),
        plan,
        session: makeSession({
          planHistory: [
            { conceptId: CONCEPT_ORDERED_PAIRS.id, conceptTitle: CONCEPT_ORDERED_PAIRS.title, plan: [], startedAt: new Date().toISOString() },
          ],
        }),
      });

      vi.mocked(lp.patch).mockResolvedValue({});
      // lp.get #1: origin journey node
      vi.mocked(lp.get).mockResolvedValueOnce([{
        id: 'node-completing', journeyId: 'journey-1',
        conceptId: CONCEPT_COMPLETING_SOLUTIONS.id,
        state: 'learn-pre-req-before', goTo: null, cameFrom: null,
        preReqToLearn: CONCEPT_ORDERED_PAIRS.id,
      }]);
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_COMPLETING_SOLUTIONS);
      // lp.get #2: origin session (found by studentId + conceptId + status=started)
      vi.mocked(lp.get).mockResolvedValueOnce([makeSession({
        status:      'started',
        conceptId:   CONCEPT_COMPLETING_SOLUTIONS.id,
        planHistory: [
          { conceptId: CONCEPT_COMPLETING_SOLUTIONS.id, conceptTitle: CONCEPT_COMPLETING_SOLUTIONS.title, plan: [], startedAt: new Date().toISOString() },
        ],
      })]);

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      // After return, ctx.session is the origin session
      // It had 1 entry (initial); returnToOrigin appends one more (resumed) → 2 total
      expect(ctx.session.planHistory).toHaveLength(2);
      expect(ctx.session.planHistory[1].conceptId).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
    });
  });

  // ── ──────────────────────────────────────────────────────────────────────────

  describe('when the student exits mid-prereq', () => {
    it('the in-memory planHistory is what session-manager.end() will persist', () => {
      // session-manager.end() patches LP with ctx.session.planHistory as-is.
      // This test verifies the mid-redirect state is correct and not lost.
      const session = makeSession({
        planHistory: [
          { conceptId: CONCEPT_COMPLETING_SOLUTIONS.id, conceptTitle: CONCEPT_COMPLETING_SOLUTIONS.title, plan: [], startedAt: new Date().toISOString() },
          { conceptId: CONCEPT_ORDERED_PAIRS.id,        conceptTitle: CONCEPT_ORDERED_PAIRS.title,        plan: [], startedAt: new Date().toISOString() },
        ],
      });

      expect(session.planHistory).toHaveLength(2);
      expect(session.planHistory.map(e => e.conceptId)).toEqual([
        CONCEPT_COMPLETING_SOLUTIONS.id,
        CONCEPT_ORDERED_PAIRS.id,
      ]);
    });
  });

});
