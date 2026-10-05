import {it,expect,vi} from 'vitest';
vi.mock('../api.js',()=>({lp:{patch:vi.fn().mockResolvedValue({})}}));
import {PracticeExercise} from '../learning/practiceExercise.js';
import {stepPresentation} from '../learning/stepPresentation.js';
import {makeCtx} from './fixtures.js';
it('sends public practice metadata only for an active practice step, including on resume',async()=>{
 const ctx=makeCtx();ctx.plan=[{id:'p',type:'practice',status:'in_progress',content:{}} as any];
 ctx.practice=new PracticeExercise([{id:'q1',type:'open',stem:'Solve this',score:3,timeSeconds:60,idealAnswer:'SECRET',hints:['SECRET'],stepsToSolve:['SECRET']},{id:'q2',type:'open',stem:'Next',score:2}],[],ctx.session.id);
 const event=stepPresentation(ctx);
 expect(event.practice).toMatchObject({index:1,total:2,earnedPoints:0,question:{id:'q1',stem:'Solve this',points:3,timeSeconds:60}});
 expect(JSON.stringify(event)).not.toContain('SECRET');
 await ctx.practice.next('pass');
 expect(stepPresentation(ctx).practice).toMatchObject({index:2,earnedPoints:3});
 await ctx.practice.next();expect(stepPresentation(ctx).practice?.earnedPoints).toBe(3);
 ctx.practice=new PracticeExercise([{id:'q1',type:'open',score:3},{id:'q2',type:'open',score:2}],ctx.practice.progress,ctx.session.id);
 expect(stepPresentation(ctx).practice).toMatchObject({index:2,earnedPoints:3});
 ctx.plan[0].type='step';expect(stepPresentation(ctx).practice).toBeNull();
});
it('does not award points for uncertainty or failure',async()=>{
 const exercise=new PracticeExercise([{id:'a',type:'open',score:2},{id:'b',type:'open',score:3}],[],'s');
 await exercise.next('not_sure');await exercise.next('fail');expect(exercise.presentation.earnedPoints).toBe(0);
});
