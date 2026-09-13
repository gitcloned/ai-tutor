import {expect,it} from 'vitest';
import {Parser} from '../output/parser.js';
import {Canvas} from '../output/canvas.js';
it('parses model3d keys split over chunks and keeps actions on their blocks',async()=>{
  const parser=new Parser(Canvas.create());const result=[];
  for(const content of ['model','3d: cuboid-volume-01\n/action: build-base\nmodel3d: cuboid-volume-01\n/action: same-volume']) {
    for await(const e of parser.parse({type:'text_chunk',content}))result.push(e);
  }
  for await(const e of parser.parse({type:'text',content:''}))result.push(e);
  expect(result).toEqual([
    {type:'model3d',content:'cuboid-volume-01',attrs:{action:'build-base'}},
    {type:'model3d',content:'cuboid-volume-01',attrs:{action:'same-volume'}},
  ]);
});
