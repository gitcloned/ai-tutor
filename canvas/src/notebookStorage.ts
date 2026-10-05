import type {Editor, TLRecord, TLPageId, TLShapeId} from 'tldraw';
import {request} from './journey/api';
import {activityCamera} from './layout';

export type LessonBinding={sessionId:string;studentId:string;notebookId?:string;resumed?:boolean;completed?:boolean;topicId?:string;wsUrl:string};
type Snapshot=ReturnType<Editor['store']['getStoreSnapshot']>;
type Saved={revision:number;updatedAt:string;snapshot:Snapshot;saveId?:string};
export function cleanNotebookCache(editor:Editor) {
  const pages=editor.getPages();
  if(pages.length<50)return 0;
  const old=pages.filter(p=>p.id!==editor.getCurrentPageId()&&p.meta.notebookBackedUp===true&&p.meta.notebookDirty!==true)
    .sort((a,b)=>Number(a.meta.createdAt??0)-Number(b.meta.createdAt??0)).slice(0,Math.ceil(pages.length/2));
  for(const page of old)editor.deletePage(page.id);
  if(old.length){
    const shapes=JSON.stringify(editor.store.allRecords().filter(r=>r.typeName==='shape'));
    editor.deleteAssets(editor.getAssets().filter(asset=>!shapes.includes(asset.id)).map(asset=>asset.id));
  }
  return old.length;
}
/** Export a single page, its descendants, bindings and referenced assets. */
export function notebookSnapshot(editor:Editor,pageId:TLPageId):Snapshot {
  const snapshot=editor.store.getStoreSnapshot('document');
  const records=Object.values(snapshot.store), ids=new Set<string>([pageId]);
  let changed=true;
  while(changed){changed=false;for(const record of records)if(record.typeName==='shape'&&ids.has(record.parentId)&&!ids.has(record.id)){ids.add(record.id);changed=true;}}
  const shapeText=JSON.stringify(records.filter(r=>ids.has(r.id)));
  for(const r of records){
    if(r.typeName==='document'||(r.typeName==='asset'&&shapeText.includes(r.id))||(r.typeName==='binding'&&ids.has(r.fromId)&&ids.has(r.toId)))ids.add(r.id);
  }
  return {...snapshot,store:Object.fromEntries(records.filter(r=>ids.has(r.id)).map(r=>[r.id,r]))};
}
/** Compare editable content, not transport bookkeeping or object insertion order. */
export function notebookContent(snapshot:Snapshot):string {
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
  const records=Object.values(snapshot.store).filter(r=>r.typeName!=='document').map(record=>{
    if(record.typeName!=='page')return record;
    const meta=Object.fromEntries(Object.entries(record.meta).filter(([key])=>!['notebookRevision','notebookDirty','notebookBackedUp','notebookPendingSaveId'].includes(key)));
    return {...record,meta};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  return JSON.stringify(canonical(records));
}
/** Restore the current discussion, never shrink a whole notebook to fit. */
export function focusNotebookEnd(editor:Editor):TLShapeId|null {
  const shapes=editor.getCurrentPageShapes();
  const candidates=shapes.filter(s=>s.type!=='frame'&&s.type!=='group'&&s.type!=='model3d'&&s.type!=='function-graph');
  const saved=editor.getCurrentPage().meta.lessonFocusId;
  const target=candidates.find(s=>s.id===saved)??candidates
    .map(shape=>({shape,bounds:editor.getShapePageBounds(shape.id)}))
    .filter(item=>!!item.bounds).sort((a,b)=>b.bounds!.maxY-a.bounds!.maxY)[0]?.shape;
  if(!target)return null;
  const bounds=editor.getShapePageBounds(target.id);if(!bounds)return null;
  const screen=editor.getViewportScreenBounds();
  const toolbar=editor.getContainer().closest('.app')?.querySelector('.toolbar')?.getBoundingClientRect();
  const left=Math.max(24,toolbar?toolbar.right-screen.x+24:100);
  const area={x:left,y:40,w:Math.max(100,screen.w-left-32),h:Math.max(100,screen.h-240)};
  const model=shapes.find(s=>(s.type==='function-graph'||s.type==='model3d')&&s.meta.unpinned!==true);
  let content={x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h};
  if(model){
    const modelBounds=editor.getShapePageBounds(model.id);
    if(modelBounds){
      // Keep the active model alongside the latest work, including on the
      // review screen before the tutor reconnects. Archived models stay put.
      editor.updateShape({id:model.id,type:model.type,y:model.y+bounds.y-modelBounds.y});
      const x=Math.min(bounds.x,modelBounds.x);
      content={x,y:bounds.y,w:Math.max(bounds.x+bounds.w,modelBounds.x+modelBounds.w)-x,h:Math.max(bounds.h,modelBounds.h)};
    }
  }
  const z=Math.min(1,area.w/content.w,area.h/content.h);
  const camera=model?{x:area.x/z-content.x,y:area.y/z-content.y,z}:activityCamera(area,content,1);
  editor.setCamera(camera,{animation:{duration:0}});
  return target.id;
}

export class NotebookSync {
  private tail:Promise<void>=Promise.resolve();
  private stop:()=>void;
  private restoring=false;
  private conflict=false;
  constructor(private editor:Editor,private binding:LessonBinding,private warn:(text:string)=>void){
    this.stop=editor.store.listen(({changes})=>{
      if(this.restoring)return;
      const records=[...Object.values(changes.added),...Object.values(changes.updated).map(pair=>pair[1]),...Object.values(changes.removed)];
      const page=editor.getCurrentPage();
      if(!records.some(r=>r.typeName==='shape'&&(r.parentId===page.id||editor.getAncestorPageId(r.parentId as any)===page.id)))return;
      editor.updatePage({id:page.id,meta:{...page.meta,notebookDirty:true}});
    },{scope:'document',source:'user'});
  }
  dispose(){this.stop();}
  async restore():Promise<boolean>{
    const id=this.binding.notebookId??this.binding.sessionId;
    const local=this.editor.getPages().filter(p=>p.meta.notebookId===id||(Array.isArray(p.meta.sessionIds)&&(p.meta.sessionIds.includes(this.binding.sessionId)||p.meta.sessionIds.includes(id))))
      .sort((a,b)=>Number(this.editor.getPageShapeIds(b.id).size>0)-Number(this.editor.getPageShapeIds(a.id).size>0))[0];
    let saved:Saved|null;
    try{saved=await request<Saved|null>('/notebooks/'+encodeURIComponent(id),undefined,'agent');}
    catch(error){
      if(!local)throw error;
      this.warn('Could not load the server notebook. Showing the copy saved on this device.');
      this.editor.setCurrentPage(local.id);
      this.editor.updatePage({id:local.id,meta:{...local.meta,notebookId:id,sessionIds:[...new Set([...(Array.isArray(local.meta.sessionIds)?local.meta.sessionIds:[]),this.binding.sessionId])]}});
      focusNotebookEnd(this.editor);
      return this.editor.getCurrentPageShapes().length>0;
    }
    if(local&&local.meta.notebookDirty===true){
      this.editor.setCurrentPage(local.id);
      if(saved){
        const same=notebookContent(notebookSnapshot(this.editor,local.id))===notebookContent(saved.snapshot);
        const pendingKey='prodigy-notebook-pending:'+this.binding.studentId+':'+id;
        const ownSave=!!saved.saveId&&(saved.saveId===local.meta.notebookPendingSaveId||saved.saveId===sessionStorage.getItem(pendingKey));
        if(same||ownSave){
          this.editor.updatePage({id:local.id,meta:{...local.meta,notebookRevision:saved.revision,notebookBackedUp:true,notebookDirty:!same,notebookPendingSaveId:''}});
          sessionStorage.removeItem(pendingKey);
        }else if(Number(local.meta.notebookRevision??0)!==saved.revision){
          this.conflict=true;this.warn('The local and server notebooks contain different changes. Your local work is preserved. Backup is paused to avoid overwriting either copy.');
        }
      }
    }else if(saved){
      this.restoring=true;
      try{
        const migrated=this.editor.store.migrateSnapshot(saved.snapshot);
        const records=Object.values(migrated.store),page=records.find(r=>r.typeName==='page');
        if(!page||page.typeName!=='page')throw new Error('Saved notebook has no page');
        this.editor.store.mergeRemoteChanges(()=>{
        if(local)this.editor.deleteShapes([...this.editor.getPageShapeIds(local.id)]);
        this.editor.store.put(records.filter(r=>r.typeName!=='document') as TLRecord[]);
        this.editor.setCurrentPage(page.id);
        this.editor.updatePage({id:page.id,meta:{...page.meta,notebookId:id,notebookRevision:saved.revision,notebookBackedUp:true,notebookDirty:false}});
        if(local&&local.id!==page.id)this.editor.deletePage(local.id);
        });
      }finally{this.restoring=false;}
    }else if(local)this.editor.setCurrentPage(local.id);
    else {if(this.binding.resumed)this.warn('The previous canvas is not available on this device or server. Your tutor can still continue the lesson.');return false;}
    const page=this.editor.getCurrentPage();
    this.editor.updatePage({id:page.id,meta:{...page.meta,notebookId:id,sessionIds:[...new Set([...(Array.isArray(page.meta.sessionIds)?page.meta.sessionIds:[]),this.binding.sessionId])]}});
    const removed=cleanNotebookCache(this.editor);
    if(removed)this.warn(`Freed space by removing ${removed} older local notebooks. Their server copies are saved.`);
    focusNotebookEnd(this.editor);
    return this.editor.getCurrentPageShapes().length>0;
  }
  save(keepalive=false):Promise<void>{
    const page=this.editor.getPages().find(p=>p.meta.notebookId===(this.binding.notebookId??this.binding.sessionId));
    if(!page||this.conflict)return this.tail;
    const snapshot=notebookSnapshot(this.editor,page.id);

    this.tail=this.tail.catch(()=>{}).then(async()=>{
      const current=this.editor.getPage(page.id);if(!current)return;
      const revision=Number(current.meta.notebookRevision??0);
      const saveId=crypto.randomUUID();
      const pendingKey='prodigy-notebook-pending:'+this.binding.studentId+':'+String(page.meta.notebookId);
      try{
        sessionStorage.setItem(pendingKey,saveId);
        this.editor.updatePage({id:page.id,meta:{...current.meta,notebookPendingSaveId:saveId}});
        const saved=await request<{revision:number}>('/notebooks/'+encodeURIComponent(String(page.meta.notebookId)),{revision,snapshot,saveId},'agent','PUT',{keepalive});
        const latest=this.editor.getPage(page.id);if(!latest)return;
        const unchanged=notebookContent(notebookSnapshot(this.editor,page.id))===notebookContent(snapshot);
        this.editor.updatePage({id:page.id,meta:{...latest.meta,notebookRevision:saved.revision,notebookBackedUp:true,notebookDirty:!unchanged,notebookPendingSaveId:''}});
        sessionStorage.removeItem(pendingKey);
        const removed=cleanNotebookCache(this.editor);
    if(removed)this.warn(`Freed space by removing ${removed} older local notebooks. Their server copies are saved.`);
      }catch(error){this.warn('Notebook saved on this device. Server backup failed: '+(error as Error).message);}
    });
    return this.tail;
  }
}
