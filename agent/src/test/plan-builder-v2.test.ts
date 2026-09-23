/**
 * Plan builder v2 — file-based markdown probe plans.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildPlanFromMarkdown } from '../learning/plan-builder-v2.js';
import { update_step }           from '../tools/plan.js';
import { makeCtx }               from './fixtures.js';

vi.mock('../api.js', () => ({
  lp:  { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  cms: { get: vi.fn() },
}));

// ── Parser ────────────────────────────────────────────────────────────────────

describe('buildPlanFromMarkdown', () => {

  it('all authored steps get type "step" with null navigation', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Ask something)
Ask the student what x is. If correct go to 2.
## 2 (Follow up)
Ask a follow-up.
`);
    const authored = plan.filter(s => s.type === 'step');
    expect(authored).toHaveLength(2);
    for (const s of authored) {
      expect(s.ifCorrect).toBeNull();
      expect(s.ifWrong).toBeNull();
    }
  });

  it('captures name from header into content.name', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Check substitution)
Ask: What is y?
`);
    const s1 = plan.find(s => s.id === '1')!;
    expect(s1.content.name).toBe('Check substitution');
  });

  it('stores full prose as content.instruction', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry question)
Ask: Given x − 5y = −15, complete ( ___, −2 ).
Correct answer: −25. If correct, advance state.
`);
    const s1 = plan.find(s => s.id === '1')!;
    expect(s1.content.instruction).toContain('−25');
    expect(s1.content.instruction).toContain('advance state');
  });

  it('works without Step keyword in header', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (First)
Some instruction.
## 2 (Second)
Another instruction.
`);
    expect(plan.find(s => s.id === '1')).toBeDefined();
    expect(plan.find(s => s.id === '2')).toBeDefined();
  });

  it('auto-appends store_memory as the final step — state advancement is now implicit', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Only step)
Ask: What is x?
`);
    const store = plan.find(s => s.type === 'store_memory')!;
    expect(store).toBeDefined();
    expect(store.ifCorrect).toBeNull(); // no explicit advance_state wired — auto-advance fires instead
    // state advancement via redirect(state) — no separate advance_state step in v2 plans
  });

  it('first step is in_progress, rest are pending', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (First)
Something.
## 2 (Second)
Something else.
`);
    expect(plan[0].status).toBe('in_progress');
    expect(plan.slice(1).every(s => s.status === 'pending')).toBe(true);
  });

});

// ── redirect step parsing ─────────────────────────────────────────────────────

describe('buildPlanFromMarkdown — redirect steps', () => {

  it('a step with redirect: becomes type "redirect" with the right conceptId', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry)
Ask the entry question.
## 2 (Prereq: ordered pairs)
redirect: checking-ordered-pair-solutions-to-equations-1
mode: teach
reason: Student does not know ordered pair notation.
`);
    const redirect = plan.find(s => s.id === '2')!;
    expect(redirect.type).toBe('redirect');
    expect(redirect.content.conceptId).toBe('checking-ordered-pair-solutions-to-equations-1');
    expect(redirect.content.state).toBe('learning');
    expect(redirect.content.reason).toBe('Student does not know ordered pair notation.');
  });

  it('a redirect step with mode: probe maps to state not_assessed', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Only step)
Ask something.
## 2 (Prereq: probe first)
redirect: some-prereq-concept
mode: probe
reason: Student needs probing first.
`);
    const redirect = plan.find(s => s.id === '2')!;
    expect(redirect.content.state).toBe('not_assessed');
  });

  it('non-redirect steps stay as type "step" even when redirect step is present', () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Normal step)
Ask the student something.
## 2 (Prereq)
redirect: some-concept
mode: teach
reason: Student needs this first.
`);
    expect(plan.find(s => s.id === '1')!.type).toBe('step');
  });

});

// ── nextStep override ─────────────────────────────────────────────────────────

describe('update_step — navigating a markdown plan', () => {

  it('when the LLM says go to step 3, it jumps there even if the plan has no pointers', async () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry)
Ask entry question. If correct go to 3, if wrong go to 2.
## 2 (Deeper probe)
Ask simpler question.
## 3 (Confirm understanding)
Ask follow-up.
`);
    plan[0].status = 'in_progress';
    const ctx = makeCtx({ plan });

    const result = await update_step.run({ id: '1', outcome: 'pass', nextStep: '3' }, ctx) as any;
    expect(result.nextStep?.id).toBe('3');
  });

  it('when the LLM forgets to provide nextStep, it falls back to the next pending step rather than ending the session', async () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry)
Ask entry question.
## 2 (Follow up)
Ask a follow-up.
## 3 (Final check)
One more question.
`);
    plan[0].status = 'in_progress';
    const ctx = makeCtx({ plan });

    // LLM marks step 1 done but gives no nextStep — authored steps have null pointers
    const result = await update_step.run({ id: '1', outcome: 'pass' }, ctx) as any;
    expect(result.allDone).toBeUndefined();
    expect(result.nextStep?.id).toBe('2');
  });

  it('when the LLM forgets nextStep mid-plan, the fallback still skips already-done steps', async () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry)
Ask entry question.
## 2 (Follow up)
Ask a follow-up.
## 3 (Final check)
One more question.
`);
    // Simulate step 2 already done
    plan[0].status = 'done';
    plan[1].status = 'done';
    plan[2].status = 'in_progress';
    const ctx = makeCtx({ plan });

    // LLM is on step 3, no nextStep — next pending is store_memory
    const result = await update_step.run({ id: '3', outcome: 'pass' }, ctx) as any;
    const storeStep = plan.find(s => s.type === 'store_memory')!;
    expect(result.nextStep?.id).toBe(storeStep.id);
  });

  it('when all steps are done and the node is in a terminal state, returns allDone', async () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Only step)
Ask the question.
`);
    // Mark all steps as done except step 1
    plan.forEach(s => { s.status = 'done'; });
    plan[0].status = 'in_progress';
    // exam_ready is terminal — no further state to advance to
    const ctx = makeCtx({ plan, journeyNode: { id: 'node-1', journeyId: 'j-1', conceptId: 'c-1', state: 'exam_ready', goTo: null, cameFrom: null, preReqToLearn: null } });

    const result = await update_step.run({ id: '1', outcome: 'pass' }, ctx) as any;
    expect(result.allDone).toBe(true);
  });

  it('when outcome is not_sure, it is treated the same as pass and moves forward', async () => {
    const { steps: plan } = buildPlanFromMarkdown(`
## 1 (Entry)
Ask entry question.
## 2 (Follow up)
Ask follow-up.
`);
    plan[0].status = 'in_progress';
    const ctx = makeCtx({ plan });

    const result = await update_step.run({ id: '1', outcome: 'not_sure', nextStep: '2' }, ctx) as any;
    expect(result.nextStep?.id).toBe('2');
    expect(result.allDone).toBeUndefined();
  });

});
