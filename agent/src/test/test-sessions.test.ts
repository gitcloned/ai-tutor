import {describe,it,expect,vi} from 'vitest';
vi.mock('../learning/plan-builder-v2.js',()=>({hasProbePlan:(id:string)=>id==='probe',hasTeachPlan:(id:string)=>id==='teach',hasMasteryPlan:(id:string)=>id==='master',hasStateQuestionsJson:()=>false}));
import {testLearner,testOwner,testStages,testStates} from '../test-sessions.js';
describe('isolated concept tests',()=>{
  it('creates fresh learner namespaces owned by the signed-in user',()=>{
    const owner='0123456789abcdef01234567';
    const a=testLearner(owner),b=testLearner(owner);
    expect(a).not.toBe(b);expect(a).not.toBe(owner);
    expect(testOwner(a)).toBe(owner);expect(testOwner(b)).toBe(owner);
    expect(testOwner(owner)).toBeNull();expect(testOwner('test-'+owner)).toBeNull();
    expect(()=>testLearner('invalid')).toThrow();
  });
  it('offers only stages with real content and uses in-progress states',()=>{
    expect(testStages({id:'probe',title:'Probe'})).toEqual(['Assess']);
    expect(testStages({id:'teach',title:'Teach'})).toEqual(['Learn']);
    expect(testStages({id:'master',title:'Master'})).toEqual(['Master']);
    expect(testStages({id:'empty',title:'Empty'})).toEqual([]);
    expect(testStates).toEqual({Assess:'assessing',Learn:'learning',Master:'mastering'});
  });
});
