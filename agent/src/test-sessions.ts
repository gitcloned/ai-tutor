import {randomBytes} from 'node:crypto';
import type {Concept} from './types.js';
import {CS} from './types.js';
import {hasProbePlan,hasTeachPlan,hasMasteryPlan,hasStateQuestionsJson} from './learning/plan-builder-v2.js';

export const testStates={Assess:CS.ASSESSING,Learn:CS.LEARNING,Master:CS.MASTERING} as const;
export type TestStage=keyof typeof testStates;
export function testStages(concept:Concept):TestStage[]{
  return [
    ...(hasProbePlan(concept.id)||concept.probingTree?.nodes?.length?['Assess' as const]:[]),
    ...(hasTeachPlan(concept.id)||concept.lessonPlan?.length?['Learn' as const]:[]),
    ...(hasMasteryPlan(concept.id)||hasStateQuestionsJson(concept.id,CS.MASTERING)?['Master' as const]:[]),
  ];
}
// A unique learner namespace keeps all nodes, memories and redirect sessions
// separate from the real learner, using the normal progression machinery.
export function testLearner(ownerId:string){
  if(!/^[a-f\d]{24}$/i.test(ownerId))throw new Error('Invalid test owner');
  return `test-${ownerId}-${randomBytes(12).toString('hex')}`;
}
export function testOwner(studentId:string){return /^test-([a-f\d]{24})-[a-f\d]{24}$/i.exec(studentId)?.[1]??null;}
