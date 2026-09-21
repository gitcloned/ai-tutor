import {it,expect} from 'vitest';
import {InputParser} from '../medium/modalities/input/parser.js';
import {OutputParser} from '../medium/modalities/output/parser.js';
import {CanvasMedium} from '../medium/canvas.js';
it('passes MCQ attributes through the streamed question',async()=>{
  const parser=new OutputParser(CanvasMedium.create()),events=[];
  const content='question: Q2\n/stem: Find y\n/choice-a: -3\n/choice-b: 3\n/answer: a';
  for(const char of content)for await(const event of parser.parse({type:'text_chunk',content:char}))events.push(event);
  for await(const event of parser.parse({type:'text',content}))events.push(event);
  expect(events).toContainEqual({type:'question',content:'Q2',attrs:{stem:'Find y','choice-a':'-3','choice-b':'3',answer:'a'}});
});
it('accepts a selection with text, without treating client grading as authoritative',async()=>{
  const parser=new InputParser(CanvasMedium.create());
  const activity={type:'choice-selected' as const,questionId:'Q2',choice:'a',text:'-3',correct:true};
  const result=await parser.parse({activity,text:'I subtracted three.'});
  expect(result.text).toContain('client-reported');expect(result.text).toContain('"choice":"a"');expect(result.text).toContain('I subtracted three.');
  await expect(parser.parse({activity:{...activity,choice:''}})).rejects.toThrow('Invalid choice');
});
