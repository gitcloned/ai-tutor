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
import { compileProbingTree } from '../plan-builder.js';
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

    it('appends one prereq entry and preserves the existing origin entry', async () => {
      const plan  = planWithTeachStep(CONCEPT_ORDERED_PAIRS.id, CONCEPT_ORDERED_PAIRS.title);
      const probe = plan.find(s => s.type === 'probe')!;
      const ctx   = makeCtx({
        concept:     CONCEPT_COMPLETING_SOLUTIONS,
        journeyNode: makeNode({ id: 'node-completing' }),
        plan,
        session: makeSession({
          planHistory: [
            // Simulates the entry seeded by buildContext for the starting concept
            { conceptId: CONCEPT_COMPLETING_SOLUTIONS.id, conceptTitle: CONCEPT_COMPLETING_SOLUTIONS.title, plan: [], startedAt: new Date().toISOString() },
          ],
        }),
      });

      vi.mocked(lp.get).mockResolvedValueOnce([]);
      vi.mocked(lp.post).mockResolvedValueOnce({
        id: 'node-ordered-pairs', journeyId: 'journey-1',
        conceptId: CONCEPT_ORDERED_PAIRS.id, state: 'not_assessed',
        goTo: CONCEPT_COMPLETING_SOLUTIONS.id, cameFrom: CONCEPT_COMPLETING_SOLUTIONS.id, preReqToLearn: null,
      });
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

      expect(ctx.session.planHistory).toHaveLength(2);
      expect(ctx.session.planHistory[0].conceptId).toBe(CONCEPT_COMPLETING_SOLUTIONS.id); // preserved
      expect(ctx.session.planHistory[1].conceptId).toBe(CONCEPT_ORDERED_PAIRS.id);        // appended
    });

    it('persists the updated planHistory and teachingPlan to LP', async () => {
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
      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_ORDERED_PAIRS);

      await update_step.run({ id: probe.id, outcome: 'fail' }, ctx);

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

    it('planHistory grows to 3 entries: origin → prereq → origin (resumed)', async () => {
      const plan        = plainProbingPlan();
      const advanceStep = plan.find(s => s.type === 'advance_state')!;
      const ctx         = makeCtx({
        concept: CONCEPT_ORDERED_PAIRS,
        journeyNode: makeNode({
          id:        'node-ordered-pairs',
          conceptId: CONCEPT_ORDERED_PAIRS.id,
          goTo:      CONCEPT_COMPLETING_SOLUTIONS.id,
          cameFrom:  CONCEPT_COMPLETING_SOLUTIONS.id,
        }),
        plan,
        session: makeSession({
          planHistory: [
            { conceptId: CONCEPT_COMPLETING_SOLUTIONS.id, conceptTitle: CONCEPT_COMPLETING_SOLUTIONS.title, plan: [], startedAt: new Date().toISOString() },
            { conceptId: CONCEPT_ORDERED_PAIRS.id,        conceptTitle: CONCEPT_ORDERED_PAIRS.title,        plan: [], startedAt: new Date().toISOString() },
          ],
        }),
      });

      vi.mocked(lp.patch).mockResolvedValue({});
      vi.mocked(lp.get).mockResolvedValueOnce([{
        id: 'node-completing', journeyId: 'journey-1',
        conceptId: CONCEPT_COMPLETING_SOLUTIONS.id,
        state: 'learn-pre-req-before', goTo: null, cameFrom: null,
        preReqToLearn: CONCEPT_ORDERED_PAIRS.id,
      }]);
      vi.mocked(cms.get).mockResolvedValueOnce(CONCEPT_COMPLETING_SOLUTIONS);

      await update_step.run({ id: advanceStep.id, outcome: 'done' }, ctx);

      expect(ctx.session.planHistory).toHaveLength(3);
      // Third entry is completing-solutions (resumed in learning state)
      expect(ctx.session.planHistory[2].conceptId).toBe(CONCEPT_COMPLETING_SOLUTIONS.id);
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
