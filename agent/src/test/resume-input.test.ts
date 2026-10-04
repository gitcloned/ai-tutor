import {beforeEach,it,expect,vi} from 'vitest';
import {makeCtx} from './fixtures.js';
const {send,create}=vi.hoisted(()=>({send:vi.fn(),create:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{chats={create};}}));
import {TurnEngine,RESUME_INSTRUCTION} from '../engine.js';
import type {ToolRegistry} from '../tools/index.js';
import type {Skill} from '../skills.js';
beforeEach(()=>{vi.clearAllMocks();create.mockReturnValue({sendMessageStream:send});send.mockImplementation(async()=> (async function*(){yield {text:'speak: Welcome back.',functionCalls:[]};})());});
async function run(resumed:boolean,lastRole:'student'|'agent'){
 const ctx=makeCtx();ctx.session.history=[{role:'student',content:'Start',timestamp:'now'},{role:lastRole,content:'What is an ordered pair?',timestamp:'now'}];
 const before=JSON.stringify(ctx.session.history);
 const engine=new TurnEngine({forSkill:()=>[]} as unknown as ToolRegistry,'Base');
 for await(const _ of engine.run({tools:[],prompt:()=>''} as unknown as Skill,ctx,{resumed})){}
 expect(JSON.stringify(ctx.session.history)).toBe(before);
}
it('preserves the tutor question as model history and sends internal resume context',async()=>{
 await run(true,'agent');expect(create.mock.calls[0][0].history).toEqual([{role:'user',parts:[{text:'Start'}]},{role:'model',parts:[{text:'What is an ordered pair?'}]}]);
 expect(create.mock.calls[0][0].config.systemInstruction).toContain(RESUME_INSTRUCTION);
 expect(create.mock.calls[0][0].config.systemInstruction).toContain('inside speak:');
 expect(create.mock.calls[0][0].config.systemInstruction).toContain('previous canvas has already been restored');
 expect(send.mock.calls[0][0].message).toContain('Internal session event');
});
it('does not resend an unanswered student message as a fresh answer on resume',async()=>{
 await run(true,'student');expect(create.mock.calls[0][0].history).toHaveLength(2);expect(send.mock.calls[0][0].message).toContain('Internal session event');
});
it('ordinary student turns still send the latest student input normally',async()=>{
 await run(false,'student');expect(create.mock.calls[0][0].history).toHaveLength(1);expect(send.mock.calls[0][0].message).toBe('What is an ordered pair?');expect(create.mock.calls[0][0].config.systemInstruction).not.toContain(RESUME_INSTRUCTION);
});
