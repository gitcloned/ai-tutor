import {it,expect} from 'vitest';
import {withSessionActivity,selectNextConcept,resumableSession,followPrerequisite} from '../../../cms/packages/progression/dist/index.js';
const topic='equations';
const nodes:any[]=[{id:'origin-node',conceptId:'origin',state:'learn-pre-req-before',preReqToLearn:'prereq',topicId:topic},{id:'prereq-node',conceptId:'prereq',state:'learning',topicId:null,cameFrom:'origin'}];
const sessions:any[]=[{id:'original',journeyNodeId:'origin-node',status:'started',conceptStateAtStart:'assessing',createdAt:'2026-10-01',history:[]},{id:'practice',journeyNodeId:'prereq-node',status:'started',conceptStateAtStart:'learning',createdAt:'2026-10-01',history:[{timestamp:'2026-10-03'}]}];
it('finds an unfinished prerequisite from saved activity without node timestamps or a prerequisite topic ID',()=>{
 const enriched=withSessionActivity(nodes,sessions);
 const result=selectNextConcept(topic,[{id:'origin',order:5,supportedPhases:['learn','master']},{id:'unstarted',order:6,supportedPhases:['learn']}],new Map(enriched.map(n=>[n.conceptId,n])),enriched);
 expect(result).toMatchObject({status:'continue',originTopicId:topic,conceptId:'prereq',state:'learning'});
 expect(resumableSession(sessions,enriched[1])).toMatchObject({id:'practice'});
 expect(nodes[0].lastActivity).toBeUndefined();
});
it('rejects completed sessions, wrong phases and wrong nodes',()=>{
 const candidates=[...sessions,{...sessions[1],id:'later-completed',status:'completed',createdAt:'2026-10-05'},{...sessions[1],id:'old-phase',conceptStateAtStart:'assessing',createdAt:'2026-10-06'}];
 expect(resumableSession(candidates,nodes[1])?.id).toBe('practice');
 expect(resumableSession(candidates,{id:'prereq-node',state:'clarity'})).toBeUndefined();
});
it('resumes an open session in its latest phase after assessment becomes teaching',()=>{
 const session={...sessions[1],conceptStateAtStart:'assessing',conceptStateAtEnd:'learning'};
 expect(resumableSession([session],nodes[1])).toBe(session);
 expect(resumableSession([session],{...nodes[1],state:'assessing'})).toBeUndefined();
 expect(resumableSession([{...session,status:'completed'}],nodes[1])).toBeUndefined();
 expect(resumableSession([{...sessions[1],conceptStateAtEnd:null}],nodes[1])).toBeDefined();
});
it('reports missing prerequisites and cycles instead of restarting at the origin',()=>{
 expect(()=>followPrerequisite(nodes[0],[nodes[0]])).toThrow('could not be found');
 expect(()=>followPrerequisite(nodes[0],[nodes[0],{...nodes[1],state:'learn-pre-req-before',preReqToLearn:'origin'}])).toThrow('cycle');
});
it('new topics still start at the last concept and completed topics have no continuation',()=>{
 const concepts=[{id:'first',order:1,supportedPhases:['learn']},{id:'last',order:2,supportedPhases:['learn']}];
 expect(selectNextConcept(topic,concepts,new Map(),[])).toMatchObject({conceptId:'last',state:'not_assessed'});
 expect(selectNextConcept(topic,concepts,new Map(concepts.map(c=>[c.id,{conceptId:c.id,state:'clarity' as const}])),[])).toEqual({status:'completed'});
});
