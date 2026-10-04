import {it,expect,vi} from 'vitest';
import {makeCtx} from './fixtures.js';
const {send}=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{chats={create:()=>({sendMessageStream:send})};}}));
import {TurnEngine} from '../engine.js';
import type {ToolRegistry} from '../tools/index.js';
import type {Skill} from '../skills.js';
it('ends a failed turn without replaying a stream that already produced output',async()=>{
 send.mockResolvedValue((async function*(){yield {text:'write: hello',functionCalls:[]};throw new TypeError('fetch failed');})());
 const events:any[]=[];const engine=new TurnEngine({forSkill:()=>[]} as unknown as ToolRegistry,'Base');
 let failure:unknown;
 try{for await(const e of engine.run({tools:[],prompt:()=>''} as unknown as Skill,makeCtx()))events.push(e);}catch(e){failure=e;}
 expect(String(failure)).toContain('Gemini response stream');expect(send).toHaveBeenCalledTimes(1);
 expect(events.filter(e=>e.type==='text_chunk')).toHaveLength(1);expect(events.at(-1)).toEqual({type:'event',event:{type:'tutor-ended'}});
});
