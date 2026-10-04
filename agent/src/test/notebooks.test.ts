import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NotebookFiles,NotebookConflict} from '../notebooks.js';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'notebooks-'));dirs.push(dir);return {dir,files:new NotebookFiles(dir)};}
it('replaces the snapshot and keeps one file, surviving a new store instance',async()=>{
 const {dir,files}=await setup();expect(await files.get('child','session')).toBeNull();
 await files.put('child','session',0,{text:'first'});
 await files.put('child','session',1,{text:'second'},'upload-2');
 expect(await new NotebookFiles(dir).get('child','session')).toMatchObject({revision:2,snapshot:{text:'second'},saveId:'upload-2'});
 expect(await readdir(join(dir,'child'))).toEqual(['session.json']);
});
it('rejects a concurrent stale write without losing the winning snapshot',async()=>{
 const {files}=await setup();const writes=await Promise.allSettled([files.put('child','session',0,{text:'new'}),files.put('child','session',0,{text:'stale'})]);
 expect(writes[0].status).toBe('fulfilled');expect(writes[1].status).toBe('rejected');
 await expect(files.put('child','session',0,{})).rejects.toBeInstanceOf(NotebookConflict);
 expect((await files.get('child','session'))?.snapshot).toEqual({text:'new'});
});
it('separates student files and rejects path traversal',async()=>{
 const {files}=await setup();await files.put('child','session',0,{});
 expect(await files.get('other','session')).toBeNull();
 await expect(files.get('..','session')).rejects.toThrow('Invalid notebook');
});
