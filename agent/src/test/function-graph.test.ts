import {expect,it} from 'vitest';
import {CanvasMedium} from '../medium/canvas.js';
import {OutputParser} from '../medium/modalities/output/parser.js';
import {InputParser} from '../medium/modalities/input/parser.js';
import type {TurnEvent} from '../engine.js';

it('streams model commands with hyphenated ranges and flushes before turn end',async()=>{
  const p=new OutputParser(CanvasMedium.create()),events:TurnEvent[]=[];
  const response='model: function-graph\n/equation: y = 2*x - 3\n/action: ask\n/targets: 2,3,4\n/x-range: -5,7\n/y-range: -5,7';
  for(const ch of response)for await(const e of p.parse({type:'text_chunk',content:ch}))events.push(e);
  for await(const e of p.parse({type:'text',content:response}))events.push(e);
  for await(const e of p.parse({type:'event',event:{type:'tutor-ended'}}))events.push(e);
  expect(events).toEqual([{type:'model',content:'function-graph',attrs:{equation:'y = 2*x - 3',action:'ask',targets:'2,3,4','x-range':'-5,7','y-range':'-5,7'}},{type:'event',event:{type:'tutor-ended'}}]);
});
it('canvas prompt does not embed global model manifests — models come from per-plan # Models declaration',()=>{
  const prompt=CanvasMedium.create().promptTemplate();
  // Global manifest JSON block removed; manifests are injected by buildModelPrompt per plan
  expect(prompt).not.toContain('Available interactive model manifests and examples');
  expect(prompt).not.toContain('"renderer"');
  // Canvas format keys are still present
  expect(prompt).toContain('model:');
  expect(prompt).toContain('model3d:');
});
it('makes structured graph attempts available in tutor history, and rejects malformed data',async()=>{
  const p=new InputParser(CanvasMedium.create());
  const activity={type:'graph-point',model:'function-graph',activityId:'graph-1',equation:'y = 2*x - 3',x:2,y:1,correct:true,complete:false,remaining:[3,4]} as const;
  const input={...activity,remaining:[3,4]};
  const result=await p.parse({activity:input});
  expect(result.text).toContain('"x":2,"y":1,"correct":true');
  expect(result.text).toContain('"remaining":[3,4]');
  await expect(p.parse({activity:{...input,x:NaN}})).rejects.toThrow('Invalid graph-point');
});
