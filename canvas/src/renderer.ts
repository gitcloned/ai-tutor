import { Box, Editor, createShapeId, PageRecordType, AssetRecordType, toRichText, type TLShapeId } from 'tldraw';
import { safeMedia, type Block } from './protocol';
import { sanitizeDiagram } from './diagram';
import { delay } from './playback';
import { playModel } from './models/playModel';
import type { ModelShape } from './models/ModelShape';
import { cameraShift, resolvePlacement, textStyle, questionText, writingFrames, WRITE_CHARACTER_DELAY_MS } from './layout';

export class CanvasRenderer {
  follow=true;
  private cursor=100;
  private origin=0;
  private started=false;
  private focused:TLShapeId|null=null;
  constructor(readonly editor:Editor,private paused:()=>boolean) {editor.on('tick',this.keepModelVisible);}
  dispose() {this.editor.off('tick',this.keepModelVisible);}
  private keepModelVisible=()=>{
    if(!this.follow)return;
    const model=this.editor.getCurrentPageShapes().find((s):s is ModelShape=>s.type==='model3d');
    if(!model)return;
    const y=this.editor.getViewportPageBounds().y+80/this.editor.getZoomLevel();
    if(Math.abs(model.y-y)>.01)this.editor.updateShape({id:model.id,type:'model3d',y});
  };
  newLesson(title:string) {
    // Each replay scenario becomes a notebook page; student work is never cleared.
    const current=this.editor.getCurrentPageShapes();
    if(this.started || current.length) {
      const id=PageRecordType.createId(); this.editor.createPage({id,name:title}); this.editor.setCurrentPage(id);
    } else this.editor.updatePage({id:this.editor.getCurrentPageId(),name:title});
    this.started=true; this.cursor=100; this.origin=0; this.follow=true;this.focused=null;
    this.editor.setCamera({x:80,y:50,z:1});
  }
  private locate(block:Block,w:number,h:number) {
    const model=this.editor.getCurrentPageShapes().find((s):s is ModelShape=>s.type==='model3d');
    const obstacles=this.editor.getCurrentPageShapes()
      .filter(shape=>shape.type!=='model3d')
      .map(shape=>this.editor.getShapePageBounds(shape.id))
      .filter((bounds):bounds is Box=>!!bounds)
      .map(bounds=>({x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h}));
    const point=resolvePlacement(block.attrs,w,h,{x:260,y:this.cursor},obstacles);
    if(block.attrs.position) point.y+=this.origin;
    if(model&&block.kind!=='model3d'){point.x=model.x+model.props.w+40;point.y=Math.max(point.y,this.cursor);}
    if(block.kind==='ask')point.y=Math.max(point.y,this.cursor+24);
    if(block.kind!=='model3d')this.cursor=Math.max(this.cursor,point.y+h+38); return point;
  }
  private focus(id:TLShapeId) {
    if(!this.follow) return;
    const model=this.editor.getCurrentPageShapes().find((s):s is ModelShape=>s.type==='model3d');
    if(this.editor.getShape(id)?.type==='model3d'&&this.focused&&this.editor.getCurrentPageShapeIds().has(this.focused))id=this.focused;
    const bounds=this.editor.getShapePageBounds(id); if(!bounds) return;
    if(this.editor.getShape(id)?.type!=='model3d')this.focused=id;
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
  async render(block:Block,signal:AbortSignal) {
    if(signal.aborted) return;
    if(block.kind==='model3d') {
      await playModel(this.editor,block,signal,this.paused,(w,h)=>this.locate(block,w,h),id=>this.focus(id));return;
    }
    const id=createShapeId(); const meta={author:'tutor',kind:block.kind};
    if(block.kind==='write' || block.kind==='ask') {
      const style=textStyle(block.kind);
      const point=this.locate(block,block.kind==='ask'?560:500,54);
      this.editor.createShape({id,type:'text',...point,meta,props:{richText:toRichText(' '),...style,autoSize:false,w:block.kind==='ask'?560:500}});
      this.focus(id);
      const text=block.kind==='ask'?questionText(block.content):block.content.trim(); const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frames=reduced?[text]:writingFrames(text);
      for(const frame of frames) {
        if(signal.aborted) return;
        this.editor.updateShape({id,type:'text',props:{richText:toRichText(frame)}});
        if(!reduced) await delay(WRITE_CHARACTER_DELAY_MS,signal,this.paused);
      }
      const bounds=this.editor.getShapePageBounds(id); if(bounds) this.cursor=Math.max(this.cursor,bounds.maxY+35);
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
    const model=this.editor.getCurrentPageShapes().find(s=>s.type==='model3d');
    if(model){const following=this.follow;this.follow=true;this.focus(model.id);this.follow=following;return;}
    const bounds=this.editor.getCurrentPageShapes().map(s=>this.editor.getShapePageBounds(s.id)).filter((b):b is Box=>!!b);
    if(!bounds.length)return;
    const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
    const maxX=Math.max(...bounds.map(b=>b.maxX)),maxY=Math.max(...bounds.map(b=>b.maxY));
    this.editor.zoomToBounds(new Box(x-80,y-80,maxX-x+160,maxY-y+160),{animation:{duration:350},targetZoom:1});
  }
}
