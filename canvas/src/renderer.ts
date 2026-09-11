import { Box, Editor, createShapeId, PageRecordType, AssetRecordType, toRichText, type TLShapeId } from 'tldraw';
import { position, safeMedia, type Block } from './protocol';
import { sanitizeDiagram } from './diagram';
import { delay } from './playback';

export class CanvasRenderer {
  follow=true;
  private cursor=100;
  private origin=0;
  private started=false;
  constructor(readonly editor:Editor,private paused:()=>boolean) {}
  newLesson(title:string) {
    // Each replay scenario becomes a notebook page; student work is never cleared.
    const current=this.editor.getCurrentPageShapes();
    if(this.started || current.length) {
      const id=PageRecordType.createId(); this.editor.createPage({id,name:title}); this.editor.setCurrentPage(id);
    } else this.editor.updatePage({id:this.editor.getCurrentPageId(),name:title});
    this.started=true; this.cursor=100; this.origin=0; this.follow=true;
    this.editor.setCamera({x:80,y:50,z:1});
  }
  private locate(block:Block,w:number,h:number) {
    const explicit=position(block.attrs,w,h);
    const point=explicit?{x:explicit.x,y:explicit.y+this.origin}:{x:260,y:this.cursor};
    // Model coordinates are preferred, but never place a new block over existing work.
    const obstacles=this.editor.getCurrentPageShapes().map(shape=>this.editor.getShapePageBounds(shape.id)).filter((bounds):bounds is Box=>!!bounds);
    for(let tries=0;tries<=obstacles.length;tries++) {
      const overlap=obstacles.find(bounds=>point.x<bounds.maxX && point.x+w>bounds.x && point.y<bounds.maxY+12 && point.y+h>bounds.y-12);
      if(!overlap)break; point.y=overlap.maxY+18;
    }
    this.cursor=Math.max(this.cursor,point.y+h+38); return point;
  }
  private focus(id:TLShapeId) {
    if(!this.follow) return;
    const bounds=this.editor.getShapePageBounds(id); if(!bounds) return;
    const view=this.editor.getViewportPageBounds();
    if(!view.contains(bounds.clone().expandBy(70))) this.editor.zoomToBounds(bounds.clone().expandBy(130),{targetZoom:Math.min(1,this.editor.getZoomLevel()),animation:{duration:350}});
  }
  async render(block:Block,signal:AbortSignal) {
    if(signal.aborted) return;
    const id=createShapeId(); const meta={author:'tutor',kind:block.kind};
    if(block.kind==='write' || block.kind==='ask') {
      const size=block.kind==='ask'?'m':block.attrs.size==='large'?'xl':'l';
      const point=this.locate(block,block.kind==='ask'?560:500,size==='xl'?70:54);
      this.editor.createShape({id,type:'text',...point,meta,props:{richText:toRichText(' '),font:block.kind==='ask'?'sans':'draw',color:block.kind==='ask'?'green':'black',size,autoSize:false,w:block.kind==='ask'?560:500}});
      const text=block.content.trim(); const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const count=reduced?text.length:Math.max(2,Math.ceil(text.length/35));
      for(let end=count;end<text.length+count;end+=count) {
        if(signal.aborted) return;
        this.editor.updateShape({id,type:'text',props:{richText:toRichText(text.slice(0,end))}});
        if(!reduced) await delay(16,signal,this.paused);
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
      this.focus(id); await delay(250,signal,this.paused); return;
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
  fit() { const bounds=this.editor.getCurrentPageBounds(); if(bounds) this.editor.zoomToBounds(new Box(bounds.x-80,bounds.y-80,bounds.w+160,bounds.h+160),{animation:{duration:350},targetZoom:1}); }
}
