import {beforeEach, expect, it, vi} from 'vitest';
import {makeCtx, makeNode} from './fixtures.js';
import {update_step, resolvePendingRedirect} from '../tools/plan.js';
import {transitionState} from '../tools/state.js';
import type {AgentContext} from '../context.js';
vi.mock('../api.js',()=>({lp:{patch:vi.fn().mockResolvedValue({})},cms:{}}));
vi.mock('../tools/state.js',()=>({transitionState:vi.fn()}));
vi.mock('../learning/stateManagement.js',()=>({buildConceptPlan:()=>({plan:[{id:'lesson',type:'step',status:'in_progress',content:{instruction:'Teach graphing'},ifCorrect:null,ifWrong:null}],models:[]})}));
vi.mock('../learning/modelPrompt.js',()=>({buildModelPrompt:()=>''}));
beforeEach(()=>vi.clearAllMocks());
it('executes a returned state redirect and starts teaching without another student message',async()=>{
 const ctx=makeCtx({journeyNode:makeNode({state:'learning'}),plan:[{id:'finish',type:'store_memory',status:'in_progress',content:{},ifCorrect:null,ifWrong:null}]});
 vi.mocked(transitionState).mockImplementationOnce(async(context:AgentContext)=>{
  context.journeyNode.state='assessing';
  context.plan=[{id:'6',type:'redirect',status:'in_progress',content:{state:'learning'},ifCorrect:null,ifWrong:null},{id:'7',type:'redirect',status:'pending',content:{state:'clarity'},ifCorrect:null,ifWrong:null}];
  return true;
 });
 const result=await update_step.run({id:'finish',outcome:'done'},ctx) as any;
 expect(ctx.journeyNode.state).toBe('learning');
 expect(result.nextStep.id).toBe('lesson');
 expect(result.action).toEqual({type:'send-ok'});
 expect(ctx.session.planHistory.at(-1)?.plan[0].id).toBe('lesson');
});

it('recovers a session already saved at a state redirect without skipping into clarity',async()=>{
 const ctx=makeCtx({journeyNode:makeNode({state:'assessing'}),plan:[
  {id:'6',type:'redirect',status:'in_progress',content:{state:'learning'},ifCorrect:null,ifWrong:null},
  {id:'7',type:'redirect',status:'pending',content:{state:'clarity'},ifCorrect:null,ifWrong:null},
 ]});
 const result=await resolvePendingRedirect(ctx) as any;
 expect(ctx.journeyNode.state).toBe('learning');
 expect(result.nextStep.id).toBe('lesson');
 expect(transitionState).not.toHaveBeenCalled();
});
