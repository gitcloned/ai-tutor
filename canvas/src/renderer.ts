import { Box, Editor, DefaultFontFaces, createShapeId, PageRecordType, AssetRecordType, toRichText, type TLShapeId } from 'tldraw';
import { safeMedia, type Block } from './protocol';
import { sanitizeDiagram } from './diagram';
import { delay } from './playback';
import { playModel } from './models/playModel';
import type { ModelShape } from './models/ModelShape';
import {renderFunctionGraph,type FunctionGraphShape} from './models/FunctionGraphShape';
import type {TLShape} from 'tldraw';
import {Questions} from './questions';
import { cameraShift, resolvePlacement, textStyle, questionText, writingFrames, WRITE_CHARACTER_DELAY_MS } from './layout';

const isTeachingModel=(s:TLShape):s is ModelShape|FunctionGraphShape=>(s.type==='model3d'||s.type==='function-graph')&&s.meta.unpinned!==true;

export class CanvasRenderer {
  follow=true;
  private cursor=100;
  private origin=0;
  private started=false;
  private focused:TLShapeId|null=null;
  private questions:Questions;
  private layoutTail:Promise<void>=Promise.resolve();
  constructor(readonly editor:Editor,private paused:()=>boolean) {this.questions=new Questions(editor);editor.on('tick',this.keepModelVisible);}
  dispose() {this.editor.off('tick',this.keepModelVisible);}
  private keepModelVisible=()=>{
    if(!this.follow)return;
    const model=this.editor.getCurrentPageShapes().find(isTeachingModel);
    if(!model)return;
    const y=this.editor.getViewportPageBounds().y+80/this.editor.getZoomLevel();
    if(Math.abs(model.y-y)>.01)this.editor.updateShape({id:model.id,type:model.type,y});
  };
  newLesson(title:string) {
    // Each replay scenario becomes a notebook page; student work is never cleared.
    const current=this.editor.getCurrentPageShapes();
    let removed=0;
    const sessionIds=this.editor.getPage(this.editor.getCurrentPageId())?.meta.sessionIds;
    if(this.started || current.length || (Array.isArray(sessionIds)&&sessionIds.length>0)) {
      const pages=this.editor.getPages();
      if(pages.length>=this.editor.options.maxPages){
        // Legacy pages have no timestamp; their existing notebook order is the
        // best available ordering. Treat them as older than dated new pages.
        const oldest=[...pages].sort((a,b)=>{
          const time=(page:typeof a)=>typeof page.meta.createdAt==='number'?page.meta.createdAt:0;
          return time(a)-time(b);
        }).slice(0,Math.ceil(pages.length/2));
        this.editor.markHistoryStoppingPoint('make-room-for-lesson');
        for(const page of oldest)this.editor.deletePage(page.id);
        removed=oldest.length;
        this.editor.markHistoryStoppingPoint('after-make-room-for-lesson');
      }
      const id=PageRecordType.createId();
      this.editor.createPage({id,name:title,meta:{createdAt:Date.now()}});
      if(!this.editor.getPage(id))throw new Error('Could not create a new canvas. Please free space in the lesson notebook.');
      this.editor.setCurrentPage(id);
    } else {
      const page=this.editor.getPage(this.editor.getCurrentPageId())!;
      this.editor.updatePage({id:page.id,name:title,meta:{...page.meta,createdAt:Date.now()}});
    }
    this.questions=new Questions(this.editor);
    this.started=true; this.cursor=100; this.origin=0; this.follow=true;this.focused=null;
    this.editor.setCamera({x:80,y:50,z:1});
    return removed;
  }
  resumeLesson(id:ReturnType<typeof PageRecordType.createId>){
    this.editor.setCurrentPage(id);
    this.started=true;this.origin=0;this.follow=true;this.focused=null;
    this.questions=new Questions(this.editor);
    const bounds=this.editor.getCurrentPageBounds();
    this.cursor=bounds?bounds.maxY+60:100;
  }
  private locate(block:Block,w:number,h:number) {
    const model=this.editor.getCurrentPageShapes().find(isTeachingModel);
    const obstacles=this.editor.getCurrentPageShapes()
      .filter(shape=>!isTeachingModel(shape))
      .map(shape=>this.editor.getShapePageBounds(shape.id))
      .filter((bounds):bounds is Box=>!!bounds)
      .map(bounds=>({x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h}));
    const isModel=block.kind==='model3d'||block.kind==='model';
    if(isModel){
      const point=resolvePlacement(block.attrs,w,h,{x:260,y:this.cursor},obstacles);
      // A pinned model travels vertically with the camera. Reserve its entire
      // column, including space beside content written before it was loaded.
      if(obstacles.length)point.x=Math.min(point.x,...obstacles.map(bounds=>bounds.x-w-40));
      return point;
    }
    const right=model?model.x+model.props.w+40:260;
    const point=resolvePlacement(block.attrs,w,h,{x:right,y:this.cursor},obstacles);
    if(block.attrs.position) point.y+=this.origin;
    if(model){point.x=right;point.y=Math.max(point.y,this.cursor);}
    if(block.kind==='ask')point.y=Math.max(point.y,this.cursor+24);
    if(block.kind!=='model3d'&&block.kind!=='model')this.cursor=Math.max(this.cursor,point.y+h+38); return point;
  }
  private focus(id:TLShapeId) {
    if(!this.follow) return;
    const model=this.editor.getCurrentPageShapes().find(isTeachingModel);
    if(id===model?.id&&this.focused&&this.editor.getCurrentPageShapeIds().has(this.focused))id=this.focused;
    const row=this.questions.rowBounds(id);
    const bounds=row??this.editor.getShapePageBounds(id); if(!bounds) return;
    if(id!==model?.id)this.focused=id;
    if(model) {
      const screen=this.editor.getViewportScreenBounds();
      const zoom=Math.min(1,(screen.w-140)/(model.props.w+40+Math.max(560,id===model.id?0:bounds.w)),(screen.h-180)/Math.max(model.props.h,bounds.h));
      const z=Math.max(.1,zoom),view=this.editor.getViewportPageBounds();
      let top=view.y;
      if(id===model.id)top=model.y-80/z;
      else if(bounds.y<top+80/z||bounds.maxY>top+screen.h*.58/z)top=bounds.y-140/z;
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:350;
      const animation={duration,easing:(t:number)=>t};
      // Move the real canvas model with the camera; all writing keeps its page
      // coordinates, so earlier work scrolls away while the model stays beside it.
      this.editor.setCamera({x:100/z-model.x,y:-top,z},{animation});
      this.keepModelVisible();
      return;
    }
    if(row){const camera=this.editor.getCamera(),screen=this.editor.getViewportScreenBounds();const z=Math.min(camera.z,(screen.w-120)/(bounds.w+80));if(z<camera.z)this.editor.setCamera({...camera,z});}
    const view=this.editor.getViewportPageBounds();
    const shift=cameraShift(
      {x:view.x,y:view.y,w:view.w,h:view.h},
      {x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h},
    );
    if(!shift) return;
    const camera=this.editor.getCamera();
    this.editor.setCamera(
      {x:camera.x-shift.x,y:camera.y-shift.y,z:camera.z},
      {animation:{duration:350}},
    );
  }
  refocus() {if(this.focused)this.focus(this.focused);}
  render(block:Block,signal:AbortSignal):Promise<void> {
    // Steps depend on previous measured text and notes, even within parallel
    // narration. Keep layout operations ordered while audio plays alongside.
    if(['question','annotate','write','ask','model','model3d','svg','play'].includes(block.kind)){
      const task=this.layoutTail.then(()=>this.renderBlock(block,signal));
      this.layoutTail=task.catch(()=>{});return task;
    }
    return this.renderBlock(block,signal);
  }
  private releaseModelLayout(){
    this.questions.start('end');
    const bounds=this.editor.getCurrentPageBounds();
    if(bounds)this.cursor=Math.max(this.cursor,bounds.maxY+60);
    this.focused=null;
  }
  private async renderBlock(block:Block,signal:AbortSignal) {
    if(signal.aborted) return;
    if(block.kind==='model'){
      this.questions.start('end');
      renderFunctionGraph(this.editor,block,(w,h)=>this.locate(block,w,h),id=>this.focus(id));
      if(block.attrs.action==='remove')this.releaseModelLayout();
      return;
    }
    if(block.kind==='question'){
      if(block.attrs.stem){
        await this.editor.fonts.ensureFontIsLoaded(DefaultFontFaces.tldraw_draw.normal.normal);
        if(signal.aborted)return;
      }
      const id=this.questions.start(block.content,block.attrs);if(id)this.focus(id);
      const bounds=this.editor.getCurrentPageBounds();if(bounds)this.cursor=Math.max(this.cursor,bounds.maxY+60);
      return;
    }
    if(block.kind==='annotate'){
      const id=this.questions.annotate(block);this.focus(id);return;
    }
    if(block.kind==='model3d') {
      await playModel(this.editor,block,signal,this.paused,(w,h)=>this.locate(block,w,h),id=>this.focus(id));
      if(block.attrs.action==='remove')this.releaseModelLayout();
      return;
    }
    const id=createShapeId(); const meta={author:'tutor',kind:block.kind};
    if(block.kind==='write' || block.kind==='ask') {
      const style=textStyle(block.kind);
      const step=block.kind==='write'?this.questions.beginStep():null;
      const point=step?{parentId:step.parentId,x:step.x,y:step.y}:this.locate(block,block.kind==='ask'?560:500,54);
      this.editor.createShape({id,type:'text',...point,meta:step?.meta??meta,props:{richText:toRichText(' '),...style,autoSize:false,w:step?.w??(block.kind==='ask'?560:500)}});
      const text=block.kind==='ask'?questionText(block.content):block.content.trim(); const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(step){this.questions.placeStep(id,text);this.questions.resize(id);}
      this.focus(id);
      const frames=reduced?[text]:writingFrames(text);
      for(const frame of frames) {
        if(signal.aborted) return;
        this.editor.updateShape({id,type:'text',props:{richText:toRichText(frame)}});
        if(step)this.questions.resize(id);
        if(!reduced) await delay(WRITE_CHARACTER_DELAY_MS,signal,this.paused);
      }
      const bounds=this.editor.getShapePageBounds(id); if(bounds) this.cursor=Math.max(this.cursor,bounds.maxY+35);
      if(block.kind==='write')this.questions.written(id);
      this.focus(id); return;
    }
    if(block.kind==='svg') {
      const svg=sanitizeDiagram(block.content);
      const width=Number(block.attrs.width)>0?Math.min(1600,Number(block.attrs.width)):svg.width;
      const height=Number(block.attrs.height)>0?Math.min(1600,Number(block.attrs.height)):width*svg.height/svg.width;
      const point=this.locate(block,width,height); const assetId=AssetRecordType.createId();
      this.editor.createAssets([{id:assetId,type:'image',typeName:'asset',meta:{},props:{name:'Tutor diagram',src:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.content)}`,w:width,h:height,mimeType:'image/svg+xml',isAnimated:false}}]);
      this.editor.createShape({id,type:'image',...point,meta,props:{assetId,w:width,h:height}});
      this.focus(id); return;
    }
    if(block.kind==='play') {
      const media=safeMedia(block.content); if(!media) throw new Error('This video link could not be opened safely.');
      const w=Math.max(160,Math.min(1000,Number(block.attrs.width)||560)),h=Math.max(90,Math.min(800,Number(block.attrs.height)||315));
      const point=this.locate(block,w,h);
      if(media.kind==='youtube') this.editor.createShape({id,type:'embed',...point,meta,props:{url:media.url,w,h}});
      else if(media.kind==='video') {
        const assetId=AssetRecordType.createId();
        this.editor.createAssets([{id:assetId,typeName:'asset',type:'video',meta:{},props:{name:'Lesson video',src:media.url,w,h,mimeType:'video/mp4',isAnimated:false}}]);
        this.editor.createShape({id,type:'video',...point,meta,props:{assetId,w,h}});
      } else this.editor.createShape({id,type:'bookmark',...point,meta,props:{url:media.url,w:Math.max(300,w),h:100}});
      this.focus(id);
    }
  }
  fit() {
    const model=this.editor.getCurrentPageShapes().find(isTeachingModel);
    if(model){const following=this.follow;this.follow=true;this.focus(model.id);this.follow=following;return;}
    const bounds=this.editor.getCurrentPageShapes().map(s=>this.editor.getShapePageBounds(s.id)).filter((b):b is Box=>!!b);
    if(!bounds.length)return;
    const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
    const maxX=Math.max(...bounds.map(b=>b.maxX)),maxY=Math.max(...bounds.map(b=>b.maxY));
    this.editor.zoomToBounds(new Box(x-80,y-80,maxX-x+160,maxY-y+160),{animation:{duration:350},targetZoom:1});
  }
}
