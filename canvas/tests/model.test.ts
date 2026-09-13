import { expect,it } from 'vitest';
import { cubePositions,validateModel,project } from '../src/models/model';
import manifest from '../../cms/packages/resources/3d-models/cuboid-volume-01/manifest.json';
import { BlockAdapter } from '../src/protocol';
it('preserves 24 distinct unit cubes through every rearrangement',()=>{
  const model=validateModel(manifest);
  for(const stage of model.actions['same-volume']){
    const cubes=cubePositions(stage.dimensions);
    expect(cubes).toHaveLength(24);
    expect(new Set(cubes.map(p=>p.join(','))).size).toBe(24);
  }
});
it('rejects model stages that exceed their cuboid capacity',()=>{
  const invalid=structuredClone(manifest);invalid.actions['build-base'][0].count=25;
  expect(()=>validateModel(invalid)).toThrow('Invalid model stage');
});
it('rotates the depth axis into the screen plane',()=>{
  expect(project([0,0,1],Math.PI/2,0)[0]).toBeCloseTo(-1);
});
it('flushes preceding writing before dispatching a model action',()=>{
  const adapter=new BlockAdapter();adapter.accept({type:'text_chunk',content:'12 cubes'});
  expect(adapter.accept({type:'model3d',content:'cuboid-volume-01',attrs:{action:'build-base'}})).toEqual([
    {kind:'write',content:'12 cubes',attrs:{}},
    {kind:'model3d',content:'cuboid-volume-01',attrs:{action:'build-base'}}
  ]);
});
