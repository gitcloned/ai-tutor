import type {AgentContext} from '../context.js';
/** Public presentation only: never expose answers, hints, or solution steps. */
export function stepPresentation(ctx:AgentContext){
 const step=ctx.plan.find(s=>s.status==='in_progress')??ctx.plan.find(s=>s.status==='pending');
 return {type:'step-changed' as const,sessionId:ctx.session.id,step:step?{id:step.id,type:step.type}:null,
   practice:step?.type==='practice'?ctx.practice?.presentation??null:null};
}
