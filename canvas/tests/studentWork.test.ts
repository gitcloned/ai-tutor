import {expect,it,vi} from 'vitest';
import {StudentWork} from '../src/studentWork';
import type {Editor,TLShape} from 'tldraw';

it('sends changed student drawings only, commits after send, and preserves edits made during capture',async()=>{
  const shape=(id:string,author?:string,n=1)=>({id,typeName:'shape',type:'draw',x:0,y:0,meta:{author},props:{segments:[n]}} as unknown as TLShape);
  let shapes=[shape('old')];let resolve!:(v:{url:string})=>void;
  const exportImage=vi.fn(()=>new Promise<{url:string}>(r=>{resolve=r;}));
  const editor={store:{allRecords:()=>shapes},getCurrentPageShapes:()=>shapes,getShapePageBounds:()=>({x:0,y:0,maxX:100,maxY:100}),toImageDataUrl:exportImage} as unknown as Editor;
  const work=new StudentWork(editor);
  shapes=[{...shape('old'),x:200},shape('tutor','tutor'),shape('new')];
  const capture=work.prepare();
  expect(exportImage.mock.calls[0][0]).toEqual(['new']);
  shapes=[...shapes.slice(0,-1),shape('new',undefined,2)];
  resolve({url:'data:image/jpeg;base64,YQ=='});
  const result=await capture;expect(result.images).toEqual([{data:'YQ==',mimeType:'image/jpeg'}]);result.commit();
  const changed=work.prepare();resolve({url:'data:image/jpeg;base64,Yg=='});(await changed).commit();
  expect((await work.prepare()).images).toEqual([]);
});
