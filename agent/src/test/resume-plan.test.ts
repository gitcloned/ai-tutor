import {it,expect,vi} from 'vitest';
import {makeSession,CONCEPT_COMPLETING_SOLUTIONS} from './fixtures.js';
const {get,post,cmsGet}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),cmsGet:vi.fn()}));
vi.mock('../api.js',()=>({lp:{get,post,patch:vi.fn()},cms:{get:cmsGet}}));
import {buildContext} from '../context.js';
it('restores the saved learning steps and skips a newer session from the wrong phase',async()=>{
 const concept=CONCEPT_COMPLETING_SOLUTIONS;
 const plan:any[]=[{id:'video',type:'step',status:'done',content:{instruction:'Watch video'}},{id:'practice',type:'step',status:'in_progress',content:{instruction:'Solve problem'}}];
 const session={...makeSession(),id:'resume-me',conceptId:concept.id,journeyNodeId:'node',status:'started',conceptStateAtStart:'learning',planHistory:[{conceptId:concept.id,conceptTitle:concept.title,plan,startedAt:'2026-10-03'}]};
 cmsGet.mockResolvedValue(concept);
 get.mockImplementation(async(path:string)=>path.startsWith('/journey-nodes/')?{id:'node',journeyId:'journey',conceptId:concept.id,state:'learning'}:path.includes('/sessions?')?[{...session,id:'wrong-phase',conceptStateAtStart:'assessing'},session]:[]);
 const ctx=await buildContext('student',concept.id,'node');
 expect(ctx.session.id).toBe('resume-me');expect(ctx.plan).toEqual(plan);expect(ctx.plan[0].status).toBe('done');expect(post).not.toHaveBeenCalled();
});
