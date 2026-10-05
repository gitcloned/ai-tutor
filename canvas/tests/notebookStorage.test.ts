import {expect,it,vi} from 'vitest';
import type {Editor} from 'tldraw';
vi.mock('../src/journey/api',()=>({request:vi.fn()}));
import {cleanNotebookCache,notebookSnapshot} from '../src/notebookStorage';
it('evicts old backed-up pages while keeping active and unsaved pages',()=>{
 const pages=Array.from({length:50},(_,i)=>({id:'page:'+i,meta:{createdAt:i,notebookBackedUp:i!==1,notebookDirty:i===2}}));
 const deleted:string[]=[];const editor={getPages:()=>pages,getCurrentPageId:()=>pages[0].id,deletePage:(id:string)=>deleted.push(id),store:{allRecords:()=>[]},getAssets:()=>[],deleteAssets:()=>{}} as unknown as Editor;
 expect(cleanNotebookCache(editor)).toBe(25);
 expect(deleted).not.toContain('page:0');expect(deleted).not.toContain('page:1');expect(deleted).not.toContain('page:2');expect(deleted[0]).toBe('page:3');
});
it('does not delete unsaved notebooks when all local pages are unsaved',()=>{
 const editor={getPages:()=>Array.from({length:50},(_,i)=>({id:'page:'+i,meta:{}})),getCurrentPageId:()=>'page:0',deletePage:vi.fn()} as unknown as Editor;
 expect(cleanNotebookCache(editor)).toBe(0);expect(editor.deletePage).not.toHaveBeenCalled();
});
it('uploads only the selected page, nested shapes and its referenced assets',()=>{
 const records=[{id:'page:a',typeName:'page'},{id:'page:b',typeName:'page'},{id:'shape:group',typeName:'shape',parentId:'page:a'},{id:'shape:nested',typeName:'shape',parentId:'shape:group',props:{assetId:'asset:photo'}},{id:'shape:other',typeName:'shape',parentId:'page:b'},{id:'asset:photo',typeName:'asset'},{id:'asset:unrelated',typeName:'asset'}];
 const editor={store:{getStoreSnapshot:()=>({schema:{},store:Object.fromEntries(records.map(r=>[r.id,r]))})}} as unknown as Editor;
 expect(Object.keys(notebookSnapshot(editor,'page:a').store)).toEqual(['page:a','shape:group','shape:nested','asset:photo']);
});

import {NotebookSync} from '../src/notebookStorage';
import {request} from '../src/journey/api';
function resumeEditor(){
 let page:any={id:'page:a',typeName:'page',name:'Lesson',meta:{sessionIds:['lesson'],notebookId:'lesson',notebookDirty:true,notebookRevision:1}};
 const shape:any={id:'shape:a',typeName:'shape',parentId:'page:a',props:{text:'equation'}};
 const snapshot=()=>({schema:{} as any,store:{[page.id]:page,[shape.id]:shape}});
 const editor={getPages:()=>[page],getCurrentPage:()=>page,getCurrentPageId:()=>page.id,getPageShapeIds:()=>new Set([shape.id]),getCurrentPageShapes:()=>[shape],setCurrentPage:()=>{},zoomToFit:()=>{},getShapePageBounds:()=>null,updatePage:(update:any)=>{page={...page,...update};},store:{listen:()=>()=>{},getStoreSnapshot:snapshot}} as unknown as Editor;
 return {editor,snapshot,shape,page:()=>page};
}
it('recovers a missing acknowledgement when content matches despite stale revision and dirty flag',async()=>{
 const local=resumeEditor();const snapshot=structuredClone(local.snapshot());snapshot.store['page:a'].meta.notebookDirty=false;
 vi.mocked(request).mockResolvedValueOnce({revision:2,snapshot});
 const warn=vi.fn();const sync=new NotebookSync(local.editor,{sessionId:'lesson',studentId:'child',wsUrl:''},warn);
 await sync.restore();expect(warn).not.toHaveBeenCalled();expect(local.page().meta).toMatchObject({notebookRevision:2,notebookDirty:false});sync.dispose();
});
it('recognises its own acknowledged upload while retaining newer local drawing',async()=>{
 const local=resumeEditor();const snapshot=structuredClone(local.snapshot());local.shape.props.text='newer local work';
 sessionStorage.setItem('prodigy-notebook-pending:child:lesson','own-upload');
 vi.mocked(request).mockResolvedValueOnce({revision:2,snapshot,saveId:'own-upload'});
 const warn=vi.fn();const sync=new NotebookSync(local.editor,{sessionId:'lesson',studentId:'child',wsUrl:''},warn);
 await sync.restore();expect(warn).not.toHaveBeenCalled();expect(local.page().meta).toMatchObject({notebookRevision:2,notebookDirty:true});expect(local.shape.props.text).toBe('newer local work');sync.dispose();
});
it('preserves and warns about genuinely different changes from an unknown upload',async()=>{
 const local=resumeEditor();const snapshot=structuredClone(local.snapshot());snapshot.store['shape:a'].props.text='different server work';
 vi.mocked(request).mockResolvedValueOnce({revision:3,snapshot,saveId:'other-upload'});
 const warn=vi.fn();const sync=new NotebookSync(local.editor,{sessionId:'lesson',studentId:'child',wsUrl:''},warn);
 await sync.restore();expect(warn).toHaveBeenCalledWith(expect.stringContaining('different changes'));expect(local.shape.props.text).toBe('equation');expect(local.page().meta.notebookRevision).toBe(1);sync.dispose();
});

it('restores the last discussion at readable zoom instead of fitting the whole long notebook',async()=>{
 const local=resumeEditor();
 const old={...local.shape,id:'shape:old',type:'text'};
 local.shape.type='text';
 const setCamera=vi.fn(),zoomToFit=vi.fn();
 Object.assign(local.editor,{
  getCurrentPageShapes:()=>[old,local.shape],
  getShapePageBounds:(id:string)=>({x:200,y:id==='shape:old'?100:15000,w:560,h:150,maxY:id==='shape:old'?250:15150}),
  getViewportScreenBounds:()=>({x:0,y:0,w:1440,h:900}),
  getContainer:()=>document.createElement('div'),
  setCamera,zoomToFit,
 });
 vi.mocked(request).mockResolvedValueOnce(null);
 const sync=new NotebookSync(local.editor,{sessionId:'lesson',studentId:'child',wsUrl:''},vi.fn());
 await sync.restore();
 expect(zoomToFit).not.toHaveBeenCalled();
 expect(setCamera).toHaveBeenCalledWith(expect.objectContaining({z:1,y:expect.any(Number)}),expect.anything());
 expect(setCamera.mock.calls[0][0].y).toBeLessThan(-14000);
 sync.dispose();
});

it('resumes with the full active graph and latest discussion in view',async()=>{
 const local=resumeEditor();local.shape.type='text';
 const graph={id:'shape:graph',type:'function-graph',x:-400,y:100,meta:{},props:{w:560,h:660}};
 const setCamera=vi.fn(),updateShape=vi.fn();
 Object.assign(local.editor,{
  getCurrentPageShapes:()=>[graph,local.shape],
  getShapePageBounds:(id:string)=>id===graph.id?{x:-400,y:100,w:560,h:660,maxY:760}:{x:200,y:15000,w:560,h:150,maxY:15150},
  getViewportScreenBounds:()=>({x:0,y:0,w:1440,h:900}),
  getContainer:()=>document.createElement('div'),setCamera,updateShape,
 });
 vi.mocked(request).mockResolvedValueOnce(null);
 const sync=new NotebookSync(local.editor,{sessionId:'lesson',studentId:'child',wsUrl:''},vi.fn());
 await sync.restore();
 expect(updateShape).toHaveBeenCalledWith(expect.objectContaining({id:graph.id,y:15000}));
 const camera=setCamera.mock.calls[0][0];
 expect((-400+camera.x)*camera.z).toBeGreaterThanOrEqual(100);
 expect((760+camera.x)*camera.z).toBeLessThanOrEqual(1408);
 expect((15660+camera.y)*camera.z).toBeLessThanOrEqual(700);
 sync.dispose();
});
