import {it,expect,vi} from 'vitest';
import {makeCtx,makeSession} from './fixtures.js';
const {create}=vi.hoisted(()=>({create:vi.fn(()=>({sendMessageStream:async function*(){yield {text:'Welcome',functionCalls:[]};}}))}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{chats={create};}}));
import {TurnEngine} from '../engine.js';
import type {ToolRegistry} from '../tools/index.js';
import type {Skill} from '../skills.js';
it('includes the stored observation on initial and resumed turns without clearing it',async()=>{
  const observation='Q2 was evaluated correctly as 18.';
  const ctx=makeCtx({session:{...makeSession(),observationToStartWith:observation}});
  const engine=new TurnEngine({forSkill:()=>[]} as unknown as ToolRegistry,'Base');
  const skill={tools:[],prompt:()=> 'Teach the next step'} as unknown as Skill;
  for await(const _ of engine.run(skill,ctx)){}
  const prompt=create.mock.calls[0] as any;
  expect(prompt[0].config.systemInstruction).toContain(observation);
  expect(prompt[0].config.systemInstruction).toContain('without repeating it');
  ctx.session.history.push({role:'agent',content:'You evaluated Q2 correctly.',timestamp:new Date().toISOString()});
  for await(const _ of engine.run(skill,ctx)){}
  expect(ctx.session.observationToStartWith).toBe(observation);
});
