import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceServer} from '../server.mjs';
test('serves the catalog and model manifest and denies non-resource paths',async()=>{
  const server=resourceServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const catalog=await fetch(base+'/3d-models/catalog.json').then(r=>r.json());assert.equal(catalog.models[0].id,'cuboid-volume-01');
    const response=await fetch(base+'/3d-models/cuboid-volume-01/manifest.json');assert.equal(response.status,200);assert.equal((await response.json()).renderer,'unit-cubes');
    assert.equal((await fetch(base+'/3d-models/%2e%2e%2fpackage.json')).status,404);
    assert.equal((await fetch(base+'/server.mjs')).status,404);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
