import {describe,it,expect} from 'vitest';
import {CanvasMedium} from '../medium/canvas.js';
import {OutputParser} from '../medium/modalities/output/parser.js';
import type {TurnEvent} from '../engine.js';

describe('worked questions',()=>{
  it('preserves empty annotations and their position relative to parallel boundaries',async()=>{
    const response='question: Q01\nparallel:start\nwrite: 2x = 4\nannotate:\n/mark: underline\n/target: 2x\nparallel:end\nquestion: end';
    const parser=new OutputParser(CanvasMedium.create()),events:TurnEvent[]=[];
    for(const content of response)for await(const e of parser.parse({type:'text_chunk',content}))events.push(e);
    for await(const e of parser.parse({type:'text',content:response}))events.push(e);
    const blocks=events.filter(e=>e.type!=='text_chunk'||e.attrs);
    expect(blocks.map(e=>e.type==='action'?(e.action as {type:string}).type:e.type)).toEqual(['question','parallel-start','text_chunk','annotate','parallel-end','question']);
    expect(blocks[3]).toEqual({type:'annotate',content:'',attrs:{mark:'underline',target:'2x'}});
    expect(blocks.at(-1)).toEqual({type:'question',content:'end',attrs:{}});
  });
  it('does not leak annotation attributes into the next turn or emit empty notes',async()=>{
    const parser=new OutputParser(CanvasMedium.create()),events:TurnEvent[]=[];
    for(const response of ['annotate:\n/mark: circle\n','annotate: A note\nannotate:\n']){
      for await(const e of parser.parse({type:'text_chunk',content:response}))events.push(e);
      for await(const e of parser.parse({type:'text',content:response}))events.push(e);
    }
    expect(events).toEqual([{type:'annotate',content:'',attrs:{mark:'circle'}},{type:'annotate',content:'A note',attrs:{}}]);
  });
});
