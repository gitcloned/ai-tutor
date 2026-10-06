import {describe, it, expect, vi} from 'vitest';
import {fileURLToPath} from 'node:url';
import {SkillLoader} from '../skills.js';
import {PracticeExercise} from '../learning/practiceExercise.js';
import {CS, type Question} from '../types.js';
import type {AgentContext} from '../context.js';
vi.mock('../api.js', () => ({lp: {patch: vi.fn().mockResolvedValue({})}}));

const skills = new SkillLoader(fileURLToPath(new URL('../../skills', import.meta.url)));
const questions = [
  {id: 'first', stem: 'First question', stepsToSolve: ['Private first step'], idealAnswer: 'Private answer'},
  {id: 'second', stem: 'Second question', stepsToSolve: ['Private second step']},
] as Question[];
function context(state: string, practice: PracticeExercise) {
  return {journeyNode: {state}, concept: {title: 'Test'}, plan: [], memories: [], practice} as unknown as AgentContext;
}

describe('current question in skill context', () => {
  it.each([CS.LEARNING, CS.MASTERING])('refreshes %s context without advancing on reads', async state => {
    const practice = new PracticeExercise(questions, [], 'session');
    const ctx = context(state, practice);
    const skill = skills.get(state);
    expect(skill.prompt(ctx)).toContain('Private first step');
    expect(skill.prompt(ctx)).toContain('Private answer');
    expect(practice.progress).toEqual([]);
    await practice.next('pass');
    expect(skill.prompt(ctx)).toContain('Private second step');
    expect(skill.prompt(ctx)).not.toContain('Private first step');
    await practice.next('pass');
    expect(skill.prompt(ctx)).toContain('"done":true');
    expect(skill.prompt(ctx)).not.toContain('Private second step');
  });
  it('restores the unanswered question and excludes teaching aids from assessment', () => {
    const practice = new PracticeExercise(questions, [{questionId: 'first', outcome: 'pass'}], 'session');
    expect(skills.get(CS.MASTERING).prompt(context(CS.MASTERING, practice))).toContain('Private second step');
    expect(skills.get(CS.ASSESSING).prompt(context(CS.ASSESSING, practice))).not.toContain('Private second step');
  });
});
