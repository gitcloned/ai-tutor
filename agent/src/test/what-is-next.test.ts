/**
 * whatIsNext — pure function tests.
 *
 * Covers every decision branch: prereq redirect, resuming, full state
 * progression with and without supportedPhases, go-to-origin, go-to-next-concept.
 *
 * All tests are pure (no mocks, no async).
 */

import { describe, it, expect } from 'vitest';
import { whatIsNext, nextStateFor } from '../learning/what-is-next.js';
import type { WhatIsNextResult } from '../learning/what-is-next.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_PHASES   = ['learn', 'master', 'exam_readiness'];
const LEARN_ONLY   = ['learn'];
const LEARN_MASTER = ['learn', 'master'];

function node(overrides: Partial<Parameters<typeof whatIsNext>[0]['currentNode']> = {}) {
  return {
    conceptId: 'concept-a',
    state:     'not_assessed' as const,
    goTo:      null,
    cameFrom:  null,
    ...overrides,
  };
}

// ── nextStateFor ──────────────────────────────────────────────────────────────

describe('nextStateFor', () => {

  describe('state progression — all phases enabled', () => {
    it('not_assessed → assessing', () => {
      expect(nextStateFor('not_assessed', ALL_PHASES)).toBe('assessing');
    });
    it('assessing → learning', () => {
      expect(nextStateFor('assessing', ALL_PHASES)).toBe('learning');
    });
    it('learning → clarity', () => {
      expect(nextStateFor('learning', ALL_PHASES)).toBe('clarity');
    });
    it('clarity → mastering (master phase enabled)', () => {
      expect(nextStateFor('clarity', ALL_PHASES)).toBe('mastering');
    });
    it('mastering → mastered', () => {
      expect(nextStateFor('mastering', ALL_PHASES)).toBe('mastered');
    });
    it('mastered → getting_exam_ready (exam_readiness phase enabled)', () => {
      expect(nextStateFor('mastered', ALL_PHASES)).toBe('getting_exam_ready');
    });
    it('getting_exam_ready → exam_ready', () => {
      expect(nextStateFor('getting_exam_ready', ALL_PHASES)).toBe('exam_ready');
    });
    it('exam_ready → null (terminal)', () => {
      expect(nextStateFor('exam_ready', ALL_PHASES)).toBeNull();
    });
  });

  describe('state progression — learn only (no master, no exam_readiness)', () => {
    it('clarity → exam_ready directly when neither master nor exam_readiness', () => {
      expect(nextStateFor('clarity', LEARN_ONLY)).toBe('exam_ready');
    });
  });

  describe('state progression — learn + master (no exam_readiness)', () => {
    it('clarity → mastering', () => {
      expect(nextStateFor('clarity', LEARN_MASTER)).toBe('mastering');
    });
    it('mastered → exam_ready directly (no exam_readiness)', () => {
      expect(nextStateFor('mastered', LEARN_MASTER)).toBe('exam_ready');
    });
  });

  describe('state progression — learn + exam_readiness (no master)', () => {
    it('clarity → getting_exam_ready when no master but exam_readiness present', () => {
      expect(nextStateFor('clarity', ['learn', 'exam_readiness'])).toBe('getting_exam_ready');
    });
  });

  describe('internal-hold states', () => {
    it('learn-pre-req-before → null (not part of progression)', () => {
      expect(nextStateFor('learn-pre-req-before', ALL_PHASES)).toBeNull();
    });
  });

});

// ── whatIsNext — prereq redirect ──────────────────────────────────────────────

describe('whatIsNext', () => {

  describe('when moveToPreReqConceptId is provided', () => {
    const result: WhatIsNextResult = whatIsNext({
      currentNode:            node({ conceptId: 'concept-a', state: 'learning' }),
      supportedPhases:        ALL_PHASES,
      resuming:               false,
      moveToPreReqConceptId:  'concept-prereq',
    });

    it('then typeOfMove is go-to-prereq', () => {
      expect(result.typeOfMove).toBe('go-to-prereq');
    });
    it('then nextConceptId is the prereq concept', () => {
      expect(result.nextConceptId).toBe('concept-prereq');
    });
    it('then updateToCurrentNode sets state to learn-pre-req-before', () => {
      expect(result.updateToCurrentNode?.state).toBe('learn-pre-req-before');
    });
    it('then updateToCurrentNode sets preReqToLearn to the prereq conceptId', () => {
      expect(result.updateToCurrentNode?.preReqToLearn).toBe('concept-prereq');
    });
    it('then updateToNextNode sets goTo back to the current concept', () => {
      expect(result.updateToNextNode?.goTo).toBe('concept-a');
    });
    it('then updateToNextNode sets cameFrom to the current concept', () => {
      expect(result.updateToNextNode?.cameFrom).toBe('concept-a');
    });
    it('then updateToNextNode sets prereq node state to not_assessed', () => {
      expect(result.updateToNextNode?.state).toBe('not_assessed');
    });
  });

  // ── resuming ───────────────────────────────────────────────────────────────

  describe('when resuming is true', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'learning' }),
      supportedPhases: ALL_PHASES,
      resuming:        true,
    });

    it('then typeOfMove is continue-current', () => {
      expect(result.typeOfMove).toBe('continue-current');
    });
    it('then no node updates are returned', () => {
      expect(result.updateToCurrentNode).toBeNull();
      expect(result.updateToNextNode).toBeNull();
    });
    it('then nextConceptId is null', () => {
      expect(result.nextConceptId).toBeNull();
    });
  });

  describe('when resuming is true even if node is at exam_ready', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'exam_ready' }),
      supportedPhases: ALL_PHASES,
      resuming:        true,
    });

    it('then still returns continue-current (resuming takes priority)', () => {
      expect(result.typeOfMove).toBe('continue-current');
    });
  });

  // ── normal state advancement ───────────────────────────────────────────────

  describe('when state is not_assessed', () => {
    const result = whatIsNext({ currentNode: node(), supportedPhases: ALL_PHASES, resuming: false });

    it('then typeOfMove is advance-state', () => {
      expect(result.typeOfMove).toBe('advance-state');
    });
    it('then updateToCurrentNode advances state to assessing', () => {
      expect(result.updateToCurrentNode?.state).toBe('assessing');
    });
    it('then nextConceptId is null (staying on same concept)', () => {
      expect(result.nextConceptId).toBeNull();
    });
  });

  describe('when state is assessing', () => {
    const result = whatIsNext({ currentNode: node({ state: 'assessing' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then advances to learning', () => {
      expect(result.updateToCurrentNode?.state).toBe('learning');
    });
  });

  describe('when state is learning', () => {
    const result = whatIsNext({ currentNode: node({ state: 'learning' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then advances to clarity', () => {
      expect(result.updateToCurrentNode?.state).toBe('clarity');
    });
  });

  describe('when state is clarity with master and exam_readiness phases', () => {
    const result = whatIsNext({ currentNode: node({ state: 'clarity' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then advances to mastering', () => {
      expect(result.updateToCurrentNode?.state).toBe('mastering');
    });
  });

  describe('when state is mastering', () => {
    const result = whatIsNext({ currentNode: node({ state: 'mastering' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then advances to mastered', () => {
      expect(result.updateToCurrentNode?.state).toBe('mastered');
    });
  });

  describe('when state is mastered with exam_readiness phase', () => {
    const result = whatIsNext({ currentNode: node({ state: 'mastered' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then advances to getting_exam_ready', () => {
      expect(result.updateToCurrentNode?.state).toBe('getting_exam_ready');
    });
  });

  // ── supportedPhases short-circuits ────────────────────────────────────────

  describe('when state is clarity with learn-only phases (no master, no exam_readiness)', () => {
    const result = whatIsNext({ currentNode: node({ state: 'clarity' }), supportedPhases: LEARN_ONLY, resuming: false });

    it('then typeOfMove is go-to-next-concept (concept fully done)', () => {
      expect(result.typeOfMove).toBe('go-to-next-concept');
    });
    it('then updateToCurrentNode sets state to exam_ready', () => {
      expect(result.updateToCurrentNode?.state).toBe('exam_ready');
    });
    it('then nextConceptId is null (no goTo on node)', () => {
      expect(result.nextConceptId).toBeNull();
    });
  });

  describe('when state is clarity with learn+master phases (no exam_readiness)', () => {
    const result = whatIsNext({ currentNode: node({ state: 'clarity' }), supportedPhases: LEARN_MASTER, resuming: false });

    it('then advances to mastering', () => {
      expect(result.updateToCurrentNode?.state).toBe('mastering');
      expect(result.typeOfMove).toBe('advance-state');
    });
  });

  describe('when state is mastered with learn+master phases (no exam_readiness)', () => {
    const result = whatIsNext({ currentNode: node({ state: 'mastered' }), supportedPhases: LEARN_MASTER, resuming: false });

    it('then typeOfMove is go-to-next-concept (concept fully done)', () => {
      expect(result.typeOfMove).toBe('go-to-next-concept');
    });
    it('then updateToCurrentNode sets state to exam_ready', () => {
      expect(result.updateToCurrentNode?.state).toBe('exam_ready');
    });
  });

  // ── getting_exam_ready → exam_ready ───────────────────────────────────────

  describe('when state is getting_exam_ready — no goTo, no cameFrom', () => {
    const result = whatIsNext({ currentNode: node({ state: 'getting_exam_ready' }), supportedPhases: ALL_PHASES, resuming: false });

    it('then typeOfMove is go-to-next-concept', () => {
      expect(result.typeOfMove).toBe('go-to-next-concept');
    });
    it('then updateToCurrentNode sets state to exam_ready', () => {
      expect(result.updateToCurrentNode?.state).toBe('exam_ready');
    });
    it('then nextConceptId is null (journey complete)', () => {
      expect(result.nextConceptId).toBeNull();
    });
    it('then updateToNextNode is null', () => {
      expect(result.updateToNextNode).toBeNull();
    });
  });

  describe('when state is getting_exam_ready and goTo is set (next concept in sequence)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'getting_exam_ready', goTo: 'concept-b' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then nextConceptId is the goTo concept', () => {
      expect(result.nextConceptId).toBe('concept-b');
    });
    it('then updateToNextNode sets next node to not_assessed', () => {
      expect(result.updateToNextNode?.state).toBe('not_assessed');
    });
  });

  // ── go-to-origin: any advance on a prereq node returns to origin ─────────

  describe('when state is learning and cameFrom is set (this is a prereq node mid-teaching)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'learning', cameFrom: 'concept-origin', goTo: 'concept-origin' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-origin', () => {
      expect(result.typeOfMove).toBe('go-to-origin');
    });
    it('then nextConceptId is the cameFrom concept', () => {
      expect(result.nextConceptId).toBe('concept-origin');
    });
    it('then updateToCurrentNode advances the prereq state to clarity and clears routing', () => {
      expect(result.updateToCurrentNode?.state).toBe('clarity');
      expect(result.updateToCurrentNode?.goTo).toBeNull();
      expect(result.updateToCurrentNode?.cameFrom).toBeNull();
    });
    it('then updateToNextNode resumes origin node at learning with preReqToLearn and cameFrom cleared', () => {
      expect(result.updateToNextNode?.state).toBe('learning');
      expect(result.updateToNextNode?.preReqToLearn).toBeNull();
      expect(result.updateToNextNode?.cameFrom).toBeNull();
    });
  });

  describe('when state is not_assessed and cameFrom is set (prereq just starting — checkpoint, not yet teaching)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'not_assessed', cameFrom: 'concept-origin' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is advance-state — prereq starts its plan before returning to origin', () => {
      expect(result.typeOfMove).toBe('advance-state');
    });
    it('then updateToCurrentNode advances prereq to assessing', () => {
      expect(result.updateToCurrentNode?.state).toBe('assessing');
    });
    it('then nextConceptId is null (staying on prereq concept)', () => {
      expect(result.nextConceptId).toBeNull();
    });
  });

  describe('when state is getting_exam_ready and cameFrom is set (prereq fully done)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'getting_exam_ready', cameFrom: 'concept-origin', goTo: 'concept-origin' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-origin', () => {
      expect(result.typeOfMove).toBe('go-to-origin');
    });
    it('then nextConceptId is the cameFrom concept', () => {
      expect(result.nextConceptId).toBe('concept-origin');
    });
    it('then updateToCurrentNode sets state to exam_ready and clears routing', () => {
      expect(result.updateToCurrentNode?.state).toBe('exam_ready');
      expect(result.updateToCurrentNode?.goTo).toBeNull();
      expect(result.updateToCurrentNode?.cameFrom).toBeNull();
    });
    it('then updateToNextNode resumes origin node at learning with preReqToLearn and cameFrom cleared', () => {
      expect(result.updateToNextNode?.state).toBe('learning');
      expect(result.updateToNextNode?.preReqToLearn).toBeNull();
      expect(result.updateToNextNode?.cameFrom).toBeNull();
    });
  });

  describe('when node is already at exam_ready and cameFrom is set', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'exam_ready', cameFrom: 'concept-origin' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-origin', () => {
      expect(result.typeOfMove).toBe('go-to-origin');
    });
    it('then updateToCurrentNode is null (node state already correct)', () => {
      expect(result.updateToCurrentNode).toBeNull();
    });
  });

  describe('when node is already at exam_ready and has goTo (no cameFrom)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'exam_ready', goTo: 'concept-b' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-next-concept', () => {
      expect(result.typeOfMove).toBe('go-to-next-concept');
    });
    it('then nextConceptId is the goTo concept', () => {
      expect(result.nextConceptId).toBe('concept-b');
    });
  });

  describe('when node is already at exam_ready with no goTo and no cameFrom', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'exam_ready' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-next-concept', () => {
      expect(result.typeOfMove).toBe('go-to-next-concept');
    });
    it('then nextConceptId is null — journey complete', () => {
      expect(result.nextConceptId).toBeNull();
    });
    it('then updateToNextNode is null', () => {
      expect(result.updateToNextNode).toBeNull();
    });
  });

  // ── learn-pre-req-before ──────────────────────────────────────────────────

  describe('when state is learn-pre-req-before (internal hold)', () => {
    const result = whatIsNext({
      currentNode:     node({ state: 'learn-pre-req-before' }),
      supportedPhases: ALL_PHASES,
      resuming:        false,
    });

    it('then typeOfMove is go-to-next-concept (no next state, no cameFrom)', () => {
      // No cameFrom → conceptCompleteResult → go-to-next-concept with null
      expect(result.typeOfMove).toBe('go-to-next-concept');
      expect(result.nextConceptId).toBeNull();
    });
  });

});
