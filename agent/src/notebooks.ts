import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {fileURLToPath} from 'node:url';
import { randomUUID } from 'node:crypto';

export type NotebookFile = {revision:number; updatedAt:string; snapshot:unknown;saveId?:string};
export class NotebookConflict extends Error {}
/** Latest snapshot only. Serialize updates and atomically replace the old file. */
export class NotebookFiles {
  private tails = new Map<string,Promise<unknown>>();
  constructor(private root=resolve(process.env.NOTEBOOK_DIR ?? fileURLToPath(new URL('../data/notebooks', import.meta.url)))) {}
  private path(student:string,id:string) {
    if(![student,id].every(v=>/^[a-zA-Z0-9_-]{1,100}$/.test(v)))throw new Error('Invalid notebook identifier');
    return join(this.root,student,id+'.json');
  }
  async get(student:string,id:string):Promise<NotebookFile|null> {
    try{return JSON.parse(await readFile(this.path(student,id),'utf8'));}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  async put(student:string,id:string,revision:number,snapshot:unknown,saveId?:string):Promise<NotebookFile> {
    const path=this.path(student,id), previous=this.tails.get(path)??Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const current=await this.get(student,id);
      if(revision!==(current?.revision??0))throw new NotebookConflict('This notebook was updated in another tab. Reopen the lesson before saving again.');
      const value={revision:revision+1,updatedAt:new Date().toISOString(),snapshot,...(saveId?{saveId}:{})};
      await mkdir(join(this.root,student),{recursive:true});
      const temp=path+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify(value));await rename(temp,path);}
      finally{await unlink(temp).catch(()=>{});}
      return value;
    });
    this.tails.set(path,task);
    try{return await task;}finally{if(this.tails.get(path)===task)this.tails.delete(path);}
  }
}
